from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm.attributes import flag_modified
from typing import List, Dict, Optional, Any
from pydantic import BaseModel
import datetime
import os
import httpx
import time
import json

from app.core.database import get_db
from app.models.domain import Integration, Project
from app.services.intelligence_service import IntelligenceService
from app.core.auth import get_optional_user, get_current_user, get_or_create_user_project, UserSession

router = APIRouter()

class IntegrationStatusResponse(BaseModel):
    id: str
    connected: bool
    has_key: bool = False
    has_configured_app: bool = False
    masked_key: Optional[str] = None
    account_email: Optional[str] = None
    selected_property: Optional[str] = None
    permission_error: Optional[str] = None
    auth_error: Optional[str] = None
    has_telemetry: bool = False
    has_no_properties: bool = False
    no_properties_warning: Optional[str] = None
    diagnostic_help: Optional[str] = None
    selected_model: Optional[str] = None
    available_models: Optional[List[Dict[str, Any]]] = None

class SelectModelRequest(BaseModel):
    project_id: int = 1
    service: str
    model_id: str

class ApiKeyRequest(BaseModel):
    project_id: int = 1
    service: Optional[str] = None
    service_name: Optional[str] = None
    api_key: str

class TestConnectionRequest(BaseModel):
    project_id: int = 1
    service: Optional[str] = None
    service_name: Optional[str] = None
    api_key: Optional[str] = None

class DisconnectRequest(BaseModel):
    project_id: int = 1
    service: Optional[str] = None
    service_name: Optional[str] = None

class GoogleOAuthAppRequest(BaseModel):
    project_id: int = 1
    service: str = "search_console"
    client_id: str
    client_secret: str
    property_id: Optional[str] = None

class LinkGoogleAccountRequest(BaseModel):
    project_id: int = 1
    service: str = "google_business"


SUPPORTED_SERVICES = [
    "pagespeed",
    "gemini",
    "openai",
    "claude",
    "perplexity",
    "serpapi",
    "google_business",
    "google_analytics",
    "search_console"
]

DEFAULT_PROVIDER_MODELS: Dict[str, List[Dict[str, Any]]] = {
    "gemini": [
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash", "description": "High-speed multimodal reasoning model", "recommended": True},
        {"id": "gemini-2.0-flash", "name": "Gemini 2.0 Flash", "description": "Next-gen multimodal workhorse model", "recommended": True},
        {"id": "gemini-2.0-flash-lite", "name": "Gemini 2.0 Flash-Lite", "description": "Ultra low-latency token-efficient model", "recommended": False},
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro", "description": "Deep reasoning for complex architectural audits", "recommended": False},
        {"id": "gemini-1.5-flash", "name": "Gemini 1.5 Flash", "description": "Stable previous generation model", "recommended": False},
        {"id": "gemini-1.5-pro", "name": "Gemini 1.5 Pro", "description": "Large-window analysis model", "recommended": False}
    ],
    "openai": [
        {"id": "gpt-4o", "name": "GPT-4o", "description": "Flagship omni model with high reasoning capacity", "recommended": True},
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "description": "Fast and affordable for structured SEO fixes", "recommended": True},
        {"id": "o3-mini", "name": "o3-mini", "description": "High-efficiency STEM and logical reasoning model", "recommended": False},
        {"id": "o1-mini", "name": "o1-mini", "description": "Fast reasoning without code overhead", "recommended": False},
        {"id": "o1", "name": "o1", "description": "Deep multi-step reasoning flagship", "recommended": False},
        {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "description": "High accuracy legacy model", "recommended": False}
    ],
    "claude": [
        {"id": "claude-3-7-sonnet-20250219", "name": "Claude 3.7 Sonnet", "description": "Hybrid standard & extended reasoning model", "recommended": True},
        {"id": "claude-3-5-sonnet-20241022", "name": "Claude 3.5 Sonnet", "description": "Industry-leading coding and content analysis", "recommended": True},
        {"id": "claude-3-5-haiku-20241022", "name": "Claude 3.5 Haiku", "description": "Ultra-fast execution model", "recommended": False},
        {"id": "claude-3-opus-20240229", "name": "Claude 3 Opus", "description": "Maximum intelligence for deeply nuanced tasks", "recommended": False}
    ],
    "perplexity": [
        {"id": "sonar", "name": "Sonar", "description": "Live real-time search & citation engine", "recommended": True},
        {"id": "sonar-pro", "name": "Sonar Pro", "description": "Advanced multi-query search & synthesis", "recommended": True},
        {"id": "sonar-reasoning", "name": "Sonar Reasoning", "description": "Chain-of-thought search citations", "recommended": False},
        {"id": "sonar-reasoning-pro", "name": "Sonar Reasoning Pro", "description": "Deep research intelligence engine", "recommended": False}
    ]
}

async def fetch_live_models_from_provider(service: str, api_key: Optional[str]) -> List[Dict[str, Any]]:
    """
    Dynamically queries provider API to discover which models are currently live
    and available for this specific account, automatically pruning deprecated/retired models.
    """
    clean_key = (api_key or "").strip()
    if clean_key.lower().startswith("bearer "):
        clean_key = clean_key[7:].strip()
    if not clean_key:
        return DEFAULT_PROVIDER_MODELS.get(service, [])

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if service == "gemini":
                res = await client.get(f"https://generativelanguage.googleapis.com/v1beta/models?key={clean_key}")
                if res.status_code == 200:
                    raw_models = res.json().get("models", [])
                    live = []
                    has_35_flash = any(m.get("name", "").endswith("gemini-3.5-flash") for m in raw_models)
                    for m in raw_models:
                        methods = m.get("supportedGenerationMethods", [])
                        if "generateContent" in methods:
                            mid = m.get("name", "").replace("models/", "")
                            if "tts" in mid or "embedding" in mid or "transcribe" in mid:
                                continue
                            display = m.get("displayName") or mid
                            if mid == "gemini-3.5-flash":
                                rec = True
                                desc = "Smart, fast & cost-effective flagship (Recommended)"
                            elif not has_35_flash and mid == "gemini-3.5-flash-lite":
                                rec = True
                                desc = "Ultra-fast token-efficient model (Recommended)"
                            elif not has_35_flash and mid == "gemini-2.5-flash":
                                rec = True
                                desc = "Multimodal flash reasoning model"
                            else:
                                rec = False
                                desc = (m.get("description") or "")[:120]
                            live.append({
                                "id": mid,
                                "name": display,
                                "description": desc,
                                "recommended": rec,
                                "is_live": True
                            })
                    priority_order = [
                        "gemini-2.5-flash",
                        "gemini-2.0-flash",
                        "gemini-2.0-flash-lite",
                        "gemini-2.5-pro",
                        "gemini-1.5-flash",
                        "gemini-1.5-pro"
                    ]
                    def sort_gemini(x):
                        xid = x["id"].lower()
                        if xid in priority_order:
                            return (0, priority_order.index(xid))
                        if x.get("recommended"):
                            return (1, xid)
                        return (2, xid)

                    live.sort(key=sort_gemini)
                    if live:
                        return live

            elif service == "openai":
                res = await client.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {clean_key}"})
                if res.status_code == 200:
                    raw = res.json().get("data", [])
                    live = []
                    for m in raw:
                        mid = m.get("id", "")
                        if mid.startswith(("gpt-4", "gpt-3.5", "o1", "o3", "chatgpt-")):
                            if any(sub in mid for sub in ["realtime", "audio", "transcribe", "instruct"]):
                                continue
                            rec = mid in ["gpt-4o", "gpt-4o-mini", "o3-mini"]
                            live.append({
                                "id": mid,
                                "name": mid,
                                "description": "Active OpenAI model" if not rec else "Flagship recommended",
                                "recommended": rec,
                                "is_live": True
                            })
                    priority = ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1-mini", "o1", "gpt-4-turbo"]
                    live.sort(key=lambda x: priority.index(x["id"]) if x["id"] in priority else 99)
                    if live:
                        return live

            elif service == "claude":
                res = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": clean_key, "anthropic-version": "2023-06-01"}
                )
                if res.status_code == 200:
                    raw = res.json().get("data", [])
                    live = []
                    for m in raw:
                        mid = m.get("id", "")
                        dname = m.get("display_name") or mid
                        rec = "sonnet" in mid.lower()
                        live.append({
                            "id": mid,
                            "name": dname,
                            "description": "Active Anthropic model",
                            "recommended": rec,
                            "is_live": True
                        })
                    if live:
                        return live

    except Exception as e:
        print(f"Notice: Live model discovery error for {service}: {e}")

    return DEFAULT_PROVIDER_MODELS.get(service, [])

def _mask_key(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    k = key.strip()
    if k.startswith("{"):
        try:
            import json
            info = json.loads(k)
            email = info.get("client_email")
            if email:
                return f"Service Account: {email}"
        except Exception:
            pass
        return "Service Account (JSON Key)"
    if len(k) <= 8:
        return "****" + k[-2:]
    return k[:4] + "...." + k[-4:]

@router.get("/status/{project_id}", response_model=List[IntegrationStatusResponse])
async def get_integration_status(
    project_id: int, 
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    target_project_id = project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    integrations = {}
    try:
        result = await db.execute(select(Integration).where(Integration.project_id == target_project_id))
        integrations = {i.integration_type: i for i in result.scalars().all()}
    except Exception as e:
        print(f"Notice: failed to query integrations status from DB: {e}")
    
    response = []
    for svc in SUPPORTED_SERVICES:
        item = integrations.get(svc)
        connected = False
        has_key = False
        raw_key = None
        account_email = None
        selected_property = None
        permission_error = None
        has_telemetry = False
        
        auth_error = None
        has_no_properties = False
        no_properties_warning = None
        diagnostic_help = None

        if item:
            config = item.config_json if isinstance(item.config_json, dict) else {}
            auth_error = config.get("last_auth_error")
            selected_property = config.get("selected_property")
            has_no_properties = bool(config.get("has_no_properties"))
            no_properties_warning = config.get("no_properties_warning")
            diagnostic_help = config.get("diagnostic_help")
            account_email = config.get("account_email")
            data_obj = config.get("data", {})
            if isinstance(data_obj, dict):
                if not account_email:
                    account_email = data_obj.get("auth_account")
                permission_error = data_obj.get("google_permission_error")
                has_telemetry = bool(data_obj.get("is_live_data"))
                if not selected_property:
                    selected_property = data_obj.get("property") or data_obj.get("property_name")

            raw_key = item.api_key or item.access_token
            is_invalid_aiza = bool(svc in ["search_console", "google_analytics"] and raw_key and raw_key.startswith("AIza"))
            
            if item.connected and not is_invalid_aiza:
                connected = True
                has_key = bool(raw_key or selected_property)
            else:
                connected = False
                has_key = bool(raw_key) if not is_invalid_aiza else False

            # Strict verification for google_business:
            # Google Business Profile / Places API strictly requires a valid Places API key (starts with AIza)
            # or verified live data with a real business name.
            # Stale OAuth tokens (ya29...) or unverified linked records MUST NOT be reported as connected.
            if svc == "google_business":
                has_valid_places_key = bool(raw_key and raw_key.strip().startswith("AIza"))
                has_real_gbp_data = bool(isinstance(data_obj, dict) and data_obj.get("business_name") and data_obj.get("status") not in [None, "NOT_CONNECTED", "Unverified", "NO_LOCATIONS"])
                if not (has_valid_places_key or has_real_gbp_data):
                    connected = False
                    has_key = False
                    if item.connected:
                        try:
                            item.connected = False
                            flag_modified(item, "connected")
                            await db.commit()
                        except Exception:
                            pass

            if not account_email and raw_key and raw_key.startswith("{"):
                try:
                    sa_data = json.loads(raw_key)
                    account_email = sa_data.get("client_email")
                except Exception:
                    pass
            
        has_configured_app = False
        if item and isinstance(item.config_json, dict):
            has_configured_app = bool(item.config_json.get("client_id"))
        if not has_configured_app and svc in ["search_console", "google_analytics"]:
            for sib_svc in ["search_console", "google_analytics"]:
                if sib_svc != svc:
                    sib_item = integrations.get(sib_svc)
                    if sib_item and isinstance(sib_item.config_json, dict) and sib_item.config_json.get("client_id"):
                        has_configured_app = True
                        break
            if not has_configured_app:
                has_configured_app = bool(os.getenv("GOOGLE_CLIENT_ID"))

        masked_key_str = None
        if connected:
            if svc == "google_analytics" and (raw_key and (raw_key.startswith("properties/") or raw_key.isdigit()) or selected_property):
                prop_val = selected_property or raw_key
                masked_key_str = f"GA4: {prop_val.replace('properties/', '')}"
            elif svc == "search_console" and (raw_key and (raw_key.startswith("sc-domain:") or raw_key.startswith("http")) or selected_property):
                prop_val = selected_property or raw_key
                masked_key_str = f"GSC: {prop_val}"
            else:
                masked_key_str = _mask_key(raw_key)
                if not masked_key_str and selected_property:
                    masked_key_str = f"GA4: {selected_property.replace('properties/', '')}" if svc == "google_analytics" else f"GSC: {selected_property}"

        selected_model = None
        available_models = None
        if svc in ["gemini", "openai", "claude", "perplexity"]:
            if item and isinstance(item.config_json, dict):
                selected_model = item.config_json.get("selected_model")
                available_models = item.config_json.get("available_models")
            if not available_models:
                available_models = DEFAULT_PROVIDER_MODELS.get(svc, [])
            if not selected_model and available_models:
                recs = [m["id"] for m in available_models if m.get("recommended")]
                selected_model = recs[0] if recs else available_models[0]["id"]

        response.append(IntegrationStatusResponse(
            id=svc,
            connected=connected,
            has_key=has_key,
            has_configured_app=has_configured_app,
            masked_key=masked_key_str,
            account_email=account_email,
            selected_property=selected_property,
            permission_error=permission_error,
            auth_error=auth_error,
            has_telemetry=has_telemetry,
            has_no_properties=has_no_properties,
            no_properties_warning=no_properties_warning,
            diagnostic_help=diagnostic_help,
            selected_model=selected_model,
            available_models=available_models
        ))
        
    return response

async def verify_credential_live(service: str, raw_key: str) -> tuple:
    """
    Zero-cost (or near-zero-cost) live verification of API credentials.
    Returns (is_valid: bool, error_or_success_msg: str, latency_ms: float).
    Invalid keys are rejected at zero cost by all providers.
    """
    import time as _time
    start = _time.time()
    clean_key = raw_key.strip()
    if clean_key.lower().startswith("bearer "):
        clean_key = clean_key[7:].strip()

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:

            # ── PageSpeed Insights (100% free Google API) ──
            if service == "pagespeed":
                params = {"url": "https://example.com", "category": "performance"}
                headers = {}
                if clean_key.startswith("ya29."):
                    headers["Authorization"] = f"Bearer {clean_key}"
                else:
                    params["key"] = clean_key
                res = await client.get(
                    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
                    params=params, headers=headers
                )
                latency = round((_time.time() - start) * 1000, 1)
                if res.status_code == 200:
                    return (True, f"PageSpeed Insights API key verified ({latency}ms)", latency)
                err = res.json().get("error", {}).get("message", "API key not valid")
                return (False, f"PageSpeed verification failed ({res.status_code}): {err}. Ensure the PageSpeed Insights API is enabled in your Google Cloud Console.", latency)

            # ── Google Gemini (100% free test — /v1beta/models consumes 0 tokens) ──
            elif service == "gemini":
                res = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={clean_key}"
                )
                latency = round((_time.time() - start) * 1000, 1)
                if res.status_code == 200:
                    return (True, f"Google Gemini API key verified ({latency}ms)", latency)
                if res.status_code in [400, 403]:
                    err = res.json().get("error", {}).get("message", "Invalid API key or Gemini API not enabled")
                    return (False, f"Gemini Authentication Failed ({res.status_code}): {err}", latency)
                if res.status_code == 429:
                    return (False, "Gemini Quota Exceeded (429): Rate limit exceeded or quota exhausted.", latency)
                return (False, f"Gemini verification failed ({res.status_code}): {res.text[:100]}", latency)

            # ── OpenAI (100% free — /v1/models consumes 0 tokens) ──
            elif service == "openai":
                res = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {clean_key}"}
                )
                latency = round((_time.time() - start) * 1000, 1)
                if res.status_code == 200:
                    return (True, f"OpenAI API key verified ({latency}ms)", latency)
                if res.status_code == 401:
                    err = res.json().get("error", {}).get("message", "Incorrect API key provided.")
                    return (False, f"OpenAI Authentication Failed (401): {err}", latency)
                if res.status_code == 429:
                    return (False, "OpenAI Quota Exceeded (429): You have run out of API credits or exceeded your rate limit.", latency)
                return (False, f"OpenAI verification failed ({res.status_code}): {res.text[:100]}", latency)

            # ── Anthropic Claude (100% free /v1/models check) ──
            elif service == "claude":
                res = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": clean_key, "anthropic-version": "2023-06-01"}
                )
                latency = round((_time.time() - start) * 1000, 1)
                if res.status_code == 200:
                    return (True, f"Anthropic Claude API key verified ({latency}ms)", latency)
                if res.status_code == 401:
                    return (False, "Claude Authentication Failed (401): Invalid x-api-key provided.", latency)
                if res.status_code == 429:
                    return (False, "Claude Quota Exceeded (429): Rate limit exceeded or credit balance exhausted.", latency)
                return (False, f"Claude verification failed ({res.status_code}): {res.text[:100]}", latency)

            # ── SerpAPI (100% free — /account.json consumes 0 search credits) ──
            elif service == "serpapi":
                res = await client.get(
                    f"https://serpapi.com/account.json?api_key={clean_key}"
                )
                latency = round((_time.time() - start) * 1000, 1)
                if res.status_code == 200:
                    return (True, f"SerpAPI key verified ({latency}ms)", latency)
                if res.status_code == 401 or "Invalid API key" in res.text:
                    return (False, "SerpAPI authentication failed: Invalid API key. Find your key at https://serpapi.com/manage-api-key", latency)
                return (False, f"SerpAPI verification failed ({res.status_code}): {res.text[:100]}", latency)

            # ── Perplexity (invalid keys return 401 at zero cost) ──
            elif service == "perplexity":
                res = await client.post(
                    "https://api.perplexity.ai/chat/completions",
                    headers={"Authorization": f"Bearer {clean_key}", "Content-Type": "application/json"},
                    json={"model": "sonar", "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1}
                )
                latency = round((_time.time() - start) * 1000, 1)
                if res.status_code == 200:
                    return (True, f"Perplexity AI key verified ({latency}ms)", latency)
                if res.status_code in [401, 403]:
                    err = res.json().get("error", {}).get("message", "Invalid or unauthorized API key.")
                    return (False, f"Perplexity authentication failed ({res.status_code}): {err}", latency)
                if res.status_code == 429:
                    return (False, "Perplexity Quota Exceeded (429): Insufficient credit balance or rate limit exceeded.", latency)
                return (False, f"Perplexity verification failed ({res.status_code}): {res.text[:100]}", latency)

            # ── Google Business / Places (100% free) ──
            elif service == "google_business":
                res = await client.get(
                    "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
                    params={"input": "Google", "inputtype": "textquery", "fields": "place_id", "key": clean_key}
                )
                latency = round((_time.time() - start) * 1000, 1)
                data = res.json()
                if data.get("status") in ["OK", "ZERO_RESULTS"]:
                    return (True, f"Google Places API key verified ({latency}ms)", latency)
                if data.get("status") == "REQUEST_DENIED":
                    err_msg = data.get("error_message", "API key invalid or Places API not enabled")
                    return (False, f"Google Places API Request Denied: {err_msg}. Ensure 'Places API' is enabled in your Google Cloud Project.", latency)
                return (False, f"Google Places verification failed: {data.get('status')} — {data.get('error_message', '')}", latency)

            # ── Google Search Console (100% free — /webmasters/v3/sites) ──
            elif service == "search_console":
                if clean_key.startswith("{"):
                    # Service Account JSON — already validated upstream by SA credential refresh
                    return (True, "Service Account JSON validated", round((_time.time() - start) * 1000, 1))
                res = await client.get(
                    "https://www.googleapis.com/webmasters/v3/sites",
                    headers={"Authorization": f"Bearer {clean_key}"}
                )
                latency = round((_time.time() - start) * 1000, 1)
                if res.status_code == 200:
                    return (True, f"Google Search Console credentials verified ({latency}ms)", latency)
                err = res.json().get("error", {}).get("message", "Invalid credentials")
                return (False, f"Search Console authorization failed ({res.status_code}): {err}", latency)

            # ── Google Analytics 4 (100% free — /v1beta/accountSummaries) ──
            elif service == "google_analytics":
                if clean_key.startswith("{"):
                    return (True, "Service Account JSON validated", round((_time.time() - start) * 1000, 1))
                res = await client.get(
                    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
                    headers={"Authorization": f"Bearer {clean_key}"}
                )
                latency = round((_time.time() - start) * 1000, 1)
                if res.status_code == 200:
                    return (True, f"Google Analytics 4 credentials verified ({latency}ms)", latency)
                err = res.json().get("error", {}).get("message", "Invalid credentials")
                return (False, f"GA4 authorization failed ({res.status_code}): {err}", latency)

            else:
                # Unknown service — skip verification
                return (True, "Service verification skipped", 0)

    except httpx.TimeoutException:
        latency = round((_time.time() - start) * 1000, 1)
        return (False, f"Verification timed out after {latency}ms. Check your network connection.", latency)
    except Exception as e:
        latency = round((_time.time() - start) * 1000, 1)
        return (False, f"Credential verification error: {str(e)}", latency)

@router.post("/key")
async def save_api_key(
    req: ApiKeyRequest, 
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    if user:
        req.project_id = await get_or_create_user_project(db, user.id)

    service = req.service or req.service_name
    if not service:
        raise HTTPException(status_code=400, detail="Service identifier is required")
    if not req.api_key or not req.api_key.strip():
        raise HTTPException(status_code=400, detail="API Key cannot be empty")
        
    raw_key = req.api_key.strip()
    if raw_key.lower().startswith("bearer "):
        raw_key = raw_key[7:].strip()

    # Reject API Keys (AIza...) for private Google OAuth services
    if service in ["search_console", "google_analytics"] and raw_key.startswith("AIza"):
        service_title = "Google Search Console" if service == "search_console" else "Google Analytics 4"
        raise HTTPException(
            status_code=400, 
            detail=f"{service_title} requires an OAuth 2.0 User Access Token (ya29...), Google 1-Click Sign-In, or a Service Account JSON. API Keys (AIza...) are not permitted by Google for private site telemetry."
        )

    # Detect GA4 Measurement IDs (G-...) or numeric Property IDs pasted by mistake
    if service == "google_analytics":
        if raw_key.upper().startswith("G-"):
            raise HTTPException(
                status_code=400,
                detail="GA4 Measurement IDs ('G-...') are website tracking script tags, not API authorization credentials. To connect GA4 telemetry, please use '1-Click Sign-In with Google' or paste a 'Service Account JSON' key."
            )
        if raw_key.isdigit() or (raw_key.startswith("properties/") and raw_key.replace("properties/", "").isdigit()):
            clean_pid = raw_key if raw_key.startswith("properties/") else f"properties/{raw_key}"
            # Save property ID to config and connect directly
            proj_res = await db.execute(select(Project).where(Project.id == req.project_id))
            if not proj_res.scalars().first():
                db.add(Project(id=req.project_id, name="Default Project"))
                await db.flush()
            result = await db.execute(select(Integration).where(
                Integration.project_id == req.project_id,
                Integration.integration_type == service
            ))
            integration = result.scalars().first()
            if not integration:
                integration = Integration(project_id=req.project_id, integration_type=service)
                db.add(integration)
            if user:
                integration.user_id = user.id
            cfg = dict(integration.config_json or {})
            cfg["selected_property"] = clean_pid
            cfg.pop("last_auth_error", None)
            integration.config_json = cfg
            integration.connected = True
            integration.api_key = clean_pid
            flag_modified(integration, "config_json")
            await db.commit()

            # Trigger telemetry sync
            try:
                await IntelligenceService.sync_service_data(db, req.project_id, service)
            except Exception as sync_err:
                print(f"Auto-sync on GA4 property save notice: {sync_err}")

            return {
                "status": "success",
                "connected": True,
                "message": f"Target GA4 Property ({clean_pid}) connected and synchronized successfully!",
                "masked_key": f"GA4: {clean_pid.replace('properties/', '')}"
            }

    # Validate Service Account JSON if provided for Google services
    if service in ["search_console", "google_analytics"] and raw_key.startswith("{"):
        try:
            import json
            from google.oauth2 import service_account
            from google.auth.transport.requests import Request as GoogleRequest
            sa_info = json.loads(raw_key)
            scopes = (
                ["https://www.googleapis.com/auth/webmasters.readonly"]
                if service == "search_console"
                else ["https://www.googleapis.com/auth/analytics.readonly"]
            )
            creds = service_account.Credentials.from_service_account_info(sa_info, scopes=scopes)
            creds.refresh(GoogleRequest())
        except Exception as sa_err:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid Google Service Account JSON: {str(sa_err)}. Please ensure client_email and private_key are valid."
            )

    # ═══════════════════════════════════════════════════════════════════
    # CRITICAL: Zero-cost live verification BEFORE any database write.
    # If the credential is invalid, we raise HTTP 400 immediately.
    # The key is NEVER saved to the database if verification fails.
    # ═══════════════════════════════════════════════════════════════════
    is_valid, verify_msg, verify_latency = await verify_credential_live(service, raw_key)
    if not is_valid:
        raise HTTPException(status_code=400, detail=verify_msg)

    try:
        proj_res = await db.execute(select(Project).where(Project.id == req.project_id))
        proj = proj_res.scalars().first()
        if not proj:
            proj = Project(id=req.project_id, name="Default Project")
            db.add(proj)
            await db.flush()

        result = await db.execute(select(Integration).where(
            Integration.project_id == req.project_id, 
            Integration.integration_type == service
        ))
        integration = result.scalars().first()
        
        if not integration:
            integration = Integration(
                project_id=req.project_id,
                integration_type=service
            )
            db.add(integration)

        if user:
            integration.user_id = user.id

        integration.api_key = raw_key
        integration.access_token = raw_key
        integration.connected = True

        cfg = dict(integration.config_json or {})

        # For LLM providers, dynamically discover live models immediately on key save
        if service in ["gemini", "openai", "claude", "perplexity"]:
            try:
                live_models = await fetch_live_models_from_provider(service, raw_key)
                if live_models:
                    cfg["available_models"] = live_models
                    if not cfg.get("selected_model") or cfg.get("selected_model") not in [m["id"] for m in live_models]:
                        recs = [m["id"] for m in live_models if m.get("recommended")]
                        cfg["selected_model"] = recs[0] if recs else live_models[0]["id"]
            except Exception as model_err:
                print(f"Notice: Failed to fetch live models on key save for {service}: {model_err}")

        # Clear any prior authentication error on success
        cfg.pop("last_auth_error", None)
        integration.config_json = cfg
        flag_modified(integration, "config_json")
        await db.commit()

        # Trigger immediate background telemetry sync
        if service in ["google_analytics", "search_console", "pagespeed"]:
            try:
                await IntelligenceService.sync_service_data(db, req.project_id, service)
            except Exception as sync_err:
                print(f"Auto-sync on key save notice: {sync_err}")

        return {
            "status": "success", 
            "connected": True, 
            "message": f"{service.replace('_', ' ').title()} credentials saved and connected successfully!",
            "masked_key": _mask_key(raw_key),
            "selected_model": cfg.get("selected_model"),
            "available_models": cfg.get("available_models")
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save credentials: {str(e)}")

@router.get("/models/{project_id}/{service}")
async def get_provider_models(
    project_id: int,
    service: str,
    api_key: Optional[str] = None,
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    target_project_id = project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    key_to_use = api_key
    selected_model = None
    item = None

    try:
        result = await db.execute(select(Integration).where(
            Integration.project_id == target_project_id,
            Integration.integration_type == service
        ))
        item = result.scalars().first()
    except Exception:
        pass

    if not key_to_use and item:
        key_to_use = item.api_key or item.access_token
        if item.config_json and isinstance(item.config_json, dict):
            selected_model = item.config_json.get("selected_model")

    if not key_to_use:
        if service == "gemini":
            key_to_use = os.getenv("GEMINI_API_KEY")
        elif service == "openai":
            key_to_use = os.getenv("OPENAI_API_KEY")
        elif service == "claude":
            key_to_use = os.getenv("ANTHROPIC_API_KEY")

    # If already cached in DB and not explicitly refreshing, return cached models
    if not refresh and item and item.config_json and isinstance(item.config_json, dict) and item.config_json.get("available_models"):
        return {
            "service": service,
            "available_models": item.config_json["available_models"],
            "selected_model": selected_model or item.config_json.get("selected_model"),
            "live_fetched": False
        }

    # Fetch live models from provider
    live_models = await fetch_live_models_from_provider(service, key_to_use)

    # If we have an integration item, cache the live models in DB
    if item and live_models:
        cfg = dict(item.config_json or {})
        cfg["available_models"] = live_models
        if not selected_model or selected_model not in [m["id"] for m in live_models]:
            recs = [m["id"] for m in live_models if m.get("recommended")]
            cfg["selected_model"] = recs[0] if recs else live_models[0]["id"]
            selected_model = cfg["selected_model"]
        item.config_json = cfg
        flag_modified(item, "config_json")
        await db.commit()

    if not selected_model and live_models:
        recs = [m["id"] for m in live_models if m.get("recommended")]
        selected_model = recs[0] if recs else live_models[0]["id"]

    return {
        "service": service,
        "available_models": live_models,
        "selected_model": selected_model,
        "live_fetched": True
    }

@router.post("/select-model")
async def select_model(
    req: SelectModelRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    target_project_id = req.project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    result = await db.execute(select(Integration).where(
        Integration.project_id == target_project_id,
        Integration.integration_type == req.service
    ))
    item = result.scalars().first()
    if not item:
        item = Integration(
            project_id=target_project_id,
            integration_type=req.service,
            connected=True
        )
        if user:
            item.user_id = user.id
        db.add(item)

    cfg = dict(item.config_json or {})
    cfg["selected_model"] = req.model_id
    item.config_json = cfg
    flag_modified(item, "config_json")
    await db.commit()

    return {
        "status": "success",
        "service": req.service,
        "selected_model": req.model_id,
        "message": f"Active {req.service.replace('_', ' ').title()} model set to '{req.model_id}'"
    }

@router.post("/test")
async def test_connection(
    req: TestConnectionRequest, 
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    if user:
        req.project_id = await get_or_create_user_project(db, user.id)

    service = req.service or req.service_name
    if not service:
        raise HTTPException(status_code=400, detail="Service identifier is required")
    api_key = req.api_key
    
    if not api_key:
        result = await db.execute(select(Integration).where(
            Integration.project_id == req.project_id, 
            Integration.integration_type == service
        ))
        integration = result.scalars().first()
        if integration:
            api_key = integration.api_key or integration.access_token
        elif service == "pagespeed" and os.getenv("PAGESPEED_API_KEY"):
            api_key = os.getenv("PAGESPEED_API_KEY")
        elif service == "gemini" and os.getenv("GEMINI_API_KEY"):
            api_key = os.getenv("GEMINI_API_KEY")
        elif service == "search_console" and (os.getenv("SEARCH_CONSOLE_KEY") or os.getenv("SEARCH_CONSOLE_TOKEN")):
            api_key = os.getenv("SEARCH_CONSOLE_KEY") or os.getenv("SEARCH_CONSOLE_TOKEN")
            
    start_time = time.time()
    
    # 1. PageSpeed Insights test
    if service == "pagespeed":
        if not api_key:
            return {"success": False, "status": "error", "detail": "Missing PageSpeed API key or OAuth token"}
        clean_token = api_key.strip()
        if clean_token.lower().startswith("bearer "):
            clean_token = clean_token[7:].strip()
        if len(clean_token) < 8:
            return {"success": False, "status": "error", "detail": "Credential too short to be a valid Google API key or token."}
        try:
            params = {"url": "https://example.com", "category": "performance"}
            headers = {}
            if clean_token.startswith("ya29."):
                headers["Authorization"] = f"Bearer {clean_token}"
            else:
                params["key"] = clean_token
                
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(
                    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
                    params=params,
                    headers=headers
                )
                latency = round((time.time() - start_time) * 1000, 1)
                if res.status_code == 200:
                    return {
                        "success": True, 
                        "status": "ok", 
                        "message": f"Google PageSpeed Insights connection verified! ({latency}ms)",
                        "latency_ms": latency
                    }
                elif res.status_code in [400, 403]:
                    err_json = res.json().get("error", {})
                    err_msg = err_json.get("message", "API Key or OAuth token rejected by Google.")
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": f"PageSpeed verification failed ({res.status_code}): {err_msg}. Ensure the PageSpeed Insights API is enabled in your Google Cloud Console."
                    }
                else:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": f"PageSpeed API returned HTTP {res.status_code}: {res.text[:120]}"
                    }
        except Exception as e:
            return {
                "success": False, 
                "status": "error", 
                "detail": f"PageSpeed network connection failed: {str(e)}"
            }

    # 2. Google Gemini test
    elif service == "gemini":
        if not api_key:
            return {"success": False, "status": "error", "detail": "Missing Google Gemini API key"}
        clean_key = api_key.strip()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={clean_key}"
                )
                latency = round((time.time() - start_time) * 1000, 1)
                if res.status_code == 200:
                    return {
                        "success": True, 
                        "status": "ok", 
                        "message": f"Google Gemini API connection verified! ({latency}ms)", 
                        "latency_ms": latency
                    }
                elif res.status_code in [400, 403]:
                    err_json = res.json().get("error", {})
                    err_msg = err_json.get("message", "Invalid API key or Gemini API not enabled.")
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": f"Gemini Authentication Failed ({res.status_code}): {err_msg}"
                    }
                elif res.status_code == 429:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": "Gemini Quota Exceeded (429): Rate limit or quota exhausted."
                    }
                else:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": f"Gemini API returned HTTP {res.status_code}: {res.text[:100]}"
                    }
        except Exception as e:
            return {"success": False, "status": "error", "detail": f"Gemini connection error: {str(e)}"}

    # 3. OpenAI test
    elif service == "openai":
        if not api_key:
            return {"success": False, "status": "error", "detail": "Missing OpenAI API key"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {api_key.strip()}"}
                )
                latency = round((time.time() - start_time) * 1000, 1)
                if res.status_code == 200:
                    return {
                        "success": True, 
                        "status": "ok", 
                        "message": f"OpenAI API connection verified! ({latency}ms)",
                        "latency_ms": latency
                    }
                elif res.status_code == 401:
                    return {"success": False, "status": "error", "detail": "OpenAI Authentication Failed (401): Incorrect API key provided."}
                elif res.status_code == 429:
                    return {"success": False, "status": "error", "detail": "OpenAI Quota Exceeded (429): You have run out of API credits or exceeded your rate limit."}
                else:
                    return {"success": False, "status": "error", "detail": f"OpenAI verification failed ({res.status_code}): {res.text[:100]}"}
        except Exception as e:
            return {"success": False, "status": "error", "detail": f"OpenAI connection error: {str(e)}"}

    # 4. Anthropic Claude test
    elif service == "claude":
        if not api_key:
            return {"success": False, "status": "error", "detail": "Missing Anthropic Claude API key"}
        clean_key = api_key.strip()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    "https://api.anthropic.com/v1/models",
                    headers={"x-api-key": clean_key, "anthropic-version": "2023-06-01"}
                )
                latency = round((time.time() - start_time) * 1000, 1)
                if res.status_code == 200:
                    return {
                        "success": True, 
                        "status": "ok", 
                        "message": f"Anthropic Claude API connection verified! ({latency}ms)", 
                        "latency_ms": latency
                    }
                elif res.status_code == 401:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": "Claude Authentication Failed (401): Invalid Anthropic API key."
                    }
                elif res.status_code == 429:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": "Claude Quota Exceeded (429): Rate limit or credit balance exhausted."
                    }
                else:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": f"Claude API returned HTTP {res.status_code}: {res.text[:100]}"
                    }
        except Exception as e:
            return {"success": False, "status": "error", "detail": f"Claude connection error: {str(e)}"}

    # 3. Perplexity test
    elif service == "perplexity":
        if not api_key:
            return {"success": False, "status": "error", "detail": "Missing Perplexity API key"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(
                    "https://api.perplexity.ai/chat/completions",
                    headers={"Authorization": f"Bearer {api_key.strip()}", "Content-Type": "application/json"},
                    json={
                        "model": "sonar",
                        "messages": [{"role": "user", "content": "ping"}],
                        "max_tokens": 5
                    }
                )
                latency = round((time.time() - start_time) * 1000, 1)
                if res.status_code == 200:
                    return {
                        "success": True, 
                        "status": "ok", 
                        "message": f"Perplexity AI live citation connection verified! ({latency}ms)", 
                        "latency_ms": latency
                    }
                elif res.status_code in [401, 403]:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": f"Perplexity authentication failed ({res.status_code}): Invalid or unauthorized API key."
                    }
                elif res.status_code == 429:
                    return {
                        "success": False,
                        "status": "error",
                        "detail": "Perplexity Quota Exceeded (429): Insufficient credit balance or rate limit exceeded."
                    }
                else:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": f"Perplexity API returned HTTP {res.status_code}: {res.text[:100]}"
                    }
        except Exception as e:
            return {
                "success": False, 
                "status": "error", 
                "detail": f"Perplexity connection error: {str(e)}"
            }

    # 4. SerpAPI test
    elif service == "serpapi":
        if not api_key:
            return {"success": False, "status": "error", "detail": "Missing SerpAPI key"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    f"https://serpapi.com/account.json?api_key={api_key.strip()}"
                )
                latency = round((time.time() - start_time) * 1000, 1)
                if res.status_code == 200:
                    return {
                        "success": True, 
                        "status": "ok", 
                        "message": f"SerpAPI Google Search & AI Overviews connection verified! ({latency}ms)", 
                        "latency_ms": latency
                    }
                elif "Invalid API key" in res.text or res.status_code in [401, 403]:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": "SerpAPI authentication failed (401): Invalid API key."
                    }
                elif res.status_code == 429:
                    return {
                        "success": False,
                        "status": "error",
                        "detail": "SerpAPI search quota exceeded: You have exhausted your monthly searches."
                    }
                else:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": f"SerpAPI returned HTTP {res.status_code}: {res.text[:100]}"
                    }
        except Exception as e:
            return {
                "success": False, 
                "status": "error", 
                "detail": f"SerpAPI connection error: {str(e)}"
            }

    # 5. Google Business Profile / Places test
    elif service == "google_business":
        target_res = await db.execute(select(Integration).where(
            Integration.project_id == req.project_id,
            Integration.integration_type == "google_business"
        ))

        gbp_int = target_res.scalars().first()
        active_key = (api_key or (gbp_int.api_key if gbp_int else None) or "").strip()

        if active_key and active_key.startswith("AIza"):
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    res = await client.get(
                        "https://maps.googleapis.com/maps/api/place/findplacefromtext/json",
                        params={"input": "Google", "inputtype": "textquery", "fields": "place_id", "key": active_key}
                    )
                    latency = round((time.time() - start_time) * 1000, 1)
                    data = res.json()
                    if data.get("status") in ["OK", "ZERO_RESULTS"]:
                        return {
                            "success": True, 
                            "status": "ok", 
                            "message": f"Google Places & Business API verified! ({latency}ms).", 
                            "latency_ms": latency
                        }
                    elif data.get("status") == "REQUEST_DENIED":
                        err_msg = data.get("error_message", "Google Places API request denied")
                        return {
                            "success": False, 
                            "status": "error", 
                            "detail": f"Google Places API Request Denied: {err_msg}. Ensure 'Places API' is enabled in your Google Cloud Project."
                        }
                    else:
                        return {"success": False, "status": "error", "detail": f"Google Places API returned status {data.get('status')}: {data.get('error_message', '')}"}
            except Exception as e:
                return {"success": False, "status": "error", "detail": f"Google Places connection error: {str(e)}"}

        return {"success": False, "status": "error", "detail": "Missing Google Places API key. Please configure a Places API key (starts with AIza) from Google Cloud Console."}


    # 6. Google Search Console test (CRITICAL)
    elif service == "search_console":
        if not api_key:
            return {"success": False, "status": "error", "detail": "Missing Google Search Console credentials (OAuth token, Service Account JSON, or API key)"}
        
        token = api_key.strip()
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
            
        # Check if user provided Google Cloud Service Account JSON
        if token.startswith("{"):
            try:
                import json
                from google.oauth2 import service_account
                from google.auth.transport.requests import Request as GoogleRequest
                sa_info = json.loads(token)
                creds = service_account.Credentials.from_service_account_info(
                    sa_info,
                    scopes=["https://www.googleapis.com/auth/webmasters.readonly"]
                )
                creds.refresh(GoogleRequest())
                token = creds.token
            except Exception as sa_err:
                return {
                    "success": False,
                    "status": "error",
                    "detail": f"Invalid Google Service Account JSON: {str(sa_err)}. Please ensure client_email and private_key are valid."
                }
        
        # 1. If user provided a Google API Key (starts with AIza)
        if token.startswith("AIza"):
            return {
                "success": False,
                "status": "error",
                "detail": "Google API Keys ('AIza...') cannot access private Google Search Console telemetry. Google requires OAuth 2.0 User authorization or a Service Account."
            }

        # 2. Reject simulated or mock tokens
        if token.startswith("oauth_token_") or token.startswith("mock_"):
            return {
                "success": False,
                "status": "error",
                "detail": "Mock or development tokens are disabled. Please connect your Google account using a genuine OAuth Client ID & Secret."
            }
            
        # 3. OAuth Bearer Access Token (ya29... or bearer)
        headers = {"Authorization": f"Bearer {token}"}
        params = {}
            
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Query Google Webmasters / Search Console Sites endpoint
                res = await client.get("https://www.googleapis.com/webmasters/v3/sites", headers=headers, params=params)
                latency = round((time.time() - start_time) * 1000, 1)
                
                # Fetch account email for transparency
                acc_email = None
                try:
                    u_res = await client.get("https://www.googleapis.com/oauth2/v2/userinfo", headers=headers)
                    if u_res.status_code == 200:
                        acc_email = u_res.json().get("email")
                except Exception:
                    pass

                if res.status_code == 200:
                    data = res.json()
                    sites = data.get("siteEntry", [])
                    site_count = len(sites)
                    site_examples = [s.get("siteUrl", "") for s in sites[:2]]
                    example_txt = f" (e.g. {', '.join(site_examples)})" if site_examples else ""
                    
                    if site_count == 0:
                        email_str = f" for '{acc_email}'" if acc_email else ""
                        return {
                            "success": False,
                            "status": "warning",
                            "detail": f"Authenticated successfully{email_str}, but NO verified properties were found in Google Search Console. Ensure this account has Owner or Full user access in Search Console, or switch to the Google account that manages your website.",
                            "account_email": acc_email
                        }

                    return {
                        "success": True, 
                        "status": "ok", 
                        "message": f"Google Search Console authenticated ({acc_email or 'User'})! {site_count} verified properties accessible{example_txt} ({latency}ms).",
                        "latency_ms": latency
                    }
                elif res.status_code in [401, 403]:
                    err_json = res.json().get("error", {})
                    err_msg = err_json.get("message", "Invalid or expired Google Search Console credentials.")
                    if "disabled" in err_msg.lower() or "not been used in project" in err_msg.lower():
                        err_msg += " (Please enable the 'Google Search Console API' in your Google Cloud Project)."
                    return {
                        "success": False,
                        "status": "error",
                        "detail": f"Search Console authorization failed ({res.status_code}): {err_msg}"
                    }
                else:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": f"Search Console API connection received unexpected status {res.status_code}."
                    }
        except Exception as e:
            return {
                "success": False, 
                "status": "error", 
                "detail": f"Failed to connect to Google Search Console API: {str(e)}"
            }

    # 7. Google Analytics 4 (GA4) test
    elif service == "google_analytics":
        if not api_key:
            return {"success": False, "status": "error", "detail": "Missing Google Analytics credentials"}
        token = api_key.strip()
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
        
        # Check if user provided Google Cloud Service Account JSON
        if token.startswith("{"):
            try:
                import json
                from google.oauth2 import service_account
                from google.auth.transport.requests import Request as GoogleRequest
                sa_info = json.loads(token)
                creds = service_account.Credentials.from_service_account_info(
                    sa_info,
                    scopes=["https://www.googleapis.com/auth/analytics.readonly"]
                )
                creds.refresh(GoogleRequest())
                token = creds.token
            except Exception as sa_err:
                return {
                    "success": False,
                    "status": "error",
                    "detail": f"Invalid Google Service Account JSON: {str(sa_err)}. Please ensure client_email and private_key are valid."
                }
        
        if token.startswith("mock_") or token.startswith("oauth_token_"):
            return {
                "success": False,
                "status": "error",
                "detail": "Mock or development tokens are disabled. Please connect using genuine OAuth credentials."
            }
        
        if token.startswith("AIza"):
            return {
                "success": False,
                "status": "error",
                "detail": "Google API Keys ('AIza...') cannot access Google Analytics 4 telemetry. GA4 requires OAuth 2.0 User authorization or a Service Account JSON."
            }

        if token.upper().startswith("G-"):
            return {
                "success": False,
                "status": "error",
                "detail": "GA4 Measurement IDs ('G-...') are website tracking script tags, not API authorization credentials. Please connect via '1-Click Sign-In with Google' or paste a 'Service Account JSON' key."
            }

        if token.isdigit() or (token.startswith("properties/") and token.replace("properties/", "").isdigit()):
            return {
                "success": False,
                "status": "error",
                "detail": "This is a numeric GA4 Property ID. Google requires an authorized Google Sign-In or Service Account JSON to access data for this property."
            }
            
        headers = {"Authorization": f"Bearer {token}"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", headers=headers)
                latency = round((time.time() - start_time) * 1000, 1)

                # Fetch account email for transparency
                acc_email = None
                try:
                    u_res = await client.get("https://www.googleapis.com/oauth2/v2/userinfo", headers=headers)
                    if u_res.status_code == 200:
                        acc_email = u_res.json().get("email")
                except Exception:
                    pass

                if res.status_code == 200:
                    summaries = res.json().get("accountSummaries", [])
                    prop_count = sum(len(a.get("propertySummaries", [])) for a in summaries)

                    if prop_count == 0:
                        email_str = f" for '{acc_email}'" if acc_email else ""
                        return {
                            "success": False,
                            "status": "warning",
                            "detail": f"Authenticated successfully{email_str}, but NO GA4 properties were found. Ensure this account has Viewer or Editor permissions on your GA4 property, or enter your numeric Property ID directly below.",
                            "account_email": acc_email
                        }

                    return {
                        "success": True, 
                        "status": "ok", 
                        "message": f"Google Analytics 4 API authenticated ({acc_email or 'User'})! {prop_count} GA4 properties accessible ({latency}ms).", 
                        "latency_ms": latency
                    }
                elif res.status_code in [401, 403]:
                    err_json = res.json().get("error", {})
                    err_msg = err_json.get("message", "Invalid or expired OAuth token.")
                    if "disabled" in err_msg.lower() or "not been used in project" in err_msg.lower():
                        err_msg = "Google Analytics Admin API is disabled in your Google Cloud Project. Please enable it in Google Cloud Console, or enter your numeric GA4 Property ID directly."
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": f"GA4 authorization failed ({res.status_code}): {err_msg}"
                    }
                else:
                    return {
                        "success": False, 
                        "status": "error", 
                        "detail": f"GA4 API request returned HTTP status {res.status_code}"
                    }
        except Exception as e:
            return {
                "success": False, 
                "status": "error", 
                "detail": f"Failed to connect to Google Analytics 4 API: {str(e)}"
            }

    return {"success": True, "status": "ok", "message": f"{service} integration verified."}

@router.post("/google/credentials")
async def save_google_oauth_credentials(
    req: GoogleOAuthAppRequest, 
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    if user:
        req.project_id = await get_or_create_user_project(db, user.id)

    if not req.client_id or not req.client_id.strip():
        raise HTTPException(status_code=400, detail="Google Client ID is required")
    if not req.client_secret or not req.client_secret.strip():
        raise HTTPException(status_code=400, detail="Google Client Secret is required")
        
    client_id = req.client_id.strip()
    client_secret = req.client_secret.strip()
    
    from app.models.domain import Project
    proj_res = await db.execute(select(Project).where(Project.id == req.project_id))
    proj = proj_res.scalars().first()
    if not proj:
        proj = Project(id=req.project_id, name="Default Project")
        db.add(proj)
        await db.flush()

    # Synchronize credentials across Google services (Search Console & Google Analytics 4)
    target_services = [req.service]
    if req.service in ["search_console", "google_analytics"]:
        target_services = ["search_console", "google_analytics"]

    for svc in target_services:
        result = await db.execute(select(Integration).where(
            Integration.project_id == req.project_id,
            Integration.integration_type == svc
        ))
        integration = result.scalars().first()
        if not integration:
            integration = Integration(
                project_id=req.project_id,
                integration_type=svc
            )
            db.add(integration)
            
        if user:
            integration.user_id = user.id

        config = dict(integration.config_json) if (integration.config_json and isinstance(integration.config_json, dict)) else {}
        config["client_id"] = client_id
        config["client_secret"] = client_secret
        if req.property_id and req.property_id.strip() and svc == req.service:
            clean_p = req.property_id.strip()
            if req.service == "google_analytics" and not clean_p.startswith("properties/") and clean_p.isdigit():
                clean_p = f"properties/{clean_p}"
            config["selected_property"] = clean_p
        integration.config_json = config
        flag_modified(integration, "config_json")
    
    await db.commit()
    return {
        "status": "success",
        "message": "Custom Google OAuth Client ID & Secret saved successfully for Google Search Console and GA4!",
        "client_id": client_id[:12] + "..." + client_id[-10:] if len(client_id) > 22 else client_id
    }

@router.get("/google/credentials/{project_id}/{service}")
async def get_google_oauth_credentials(
    project_id: int, 
    service: str, 
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    target_project_id = project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    result = await db.execute(select(Integration).where(
        Integration.project_id == target_project_id,
        Integration.integration_type == service
    ))
    integration = result.scalars().first()
    
    custom_client_id = ""
    has_secret = False
    if integration and integration.config_json and isinstance(integration.config_json, dict):
        custom_client_id = integration.config_json.get("client_id", "")
        has_secret = bool(integration.config_json.get("client_secret"))
        
    # Check sibling Google service if current service does not have custom credentials
    if not custom_client_id and service in ["search_console", "google_analytics", "google_business"]:
        for sibling in ["search_console", "google_analytics", "google_business"]:
            if sibling == service:
                continue
            sib_res = await db.execute(select(Integration).where(
                Integration.project_id == target_project_id,
                Integration.integration_type == sibling
            ))
            sib_row = sib_res.scalars().first()
            if sib_row and sib_row.config_json and isinstance(sib_row.config_json, dict):
                custom_client_id = sib_row.config_json.get("client_id", "")
                has_secret = bool(sib_row.config_json.get("client_secret"))
                if custom_client_id:
                    break

    env_client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    env_has_secret = bool(os.environ.get("GOOGLE_CLIENT_SECRET", "").strip())
    
    effective_client_id = custom_client_id or env_client_id
    effective_has_secret = has_secret or env_has_secret
    
    return {
        "client_id": effective_client_id,
        "has_secret": effective_has_secret,
        "is_custom": bool(custom_client_id)
    }

@router.get("/google/auth")
async def google_auth_redirect(
    request: Request, 
    project_id: int, 
    service: str, 
    redirect_uri: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    target_project_id = project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    # Dynamically determine the frontend host from request headers or redirect_uri
    result = await db.execute(select(Integration).where(
        Integration.project_id == target_project_id, 
        Integration.integration_type == service
    ))
    integration = result.scalars().first()
    
    custom_client_id = None
    if integration and integration.config_json and isinstance(integration.config_json, dict):
        custom_client_id = integration.config_json.get("client_id")
        
    # Check sibling Google service fallback
    if not custom_client_id and service in ["search_console", "google_analytics", "google_business"]:
        for sibling in ["search_console", "google_analytics", "google_business"]:
            if sibling == service:
                continue
            sib_res = await db.execute(select(Integration).where(
                Integration.project_id == target_project_id,
                Integration.integration_type == sibling
            ))
            sib_row = sib_res.scalars().first()
            if sib_row and sib_row.config_json and isinstance(sib_row.config_json, dict):
                custom_client_id = sib_row.config_json.get("client_id")
                if custom_client_id:
                    break

    google_client_id = (custom_client_id or os.environ.get("GOOGLE_CLIENT_ID", "")).strip().strip('"\'')
    origin = request.headers.get("origin") or ""
    referer = request.headers.get("referer") or ""
    
    if redirect_uri and redirect_uri.strip():
        base_host = redirect_uri.rstrip("/")
    elif origin and origin.strip():
        base_host = origin.rstrip("/")
    elif referer and referer.strip():
        from urllib.parse import urlparse
        parsed = urlparse(referer)
        base_host = f"{parsed.scheme}://{parsed.netloc}"
    else:
        base_host = "http://localhost:3000"
        
    frontend_callback = f"{base_host}/integrations/callback"
    
    if google_client_id:
        from urllib.parse import urlencode
        if service == "search_console":
            scope = "https://www.googleapis.com/auth/webmasters.readonly openid email profile"
        elif service == "google_analytics":
            scope = "https://www.googleapis.com/auth/analytics.readonly openid email profile"
        else:
            scope = "https://www.googleapis.com/auth/business.manage openid email profile"

        params = {
            "client_id": google_client_id,
            "redirect_uri": frontend_callback,
            "response_type": "code",
            "scope": scope,
            "access_type": "offline",
            "prompt": "consent select_account",
            "state": f"{target_project_id}:{service}",
            "include_granted_scopes": "true",
        }
        auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
        return {"configured": True, "auth_url": auth_url, "status": "ok"}
    else:
        return {
            "configured": False, 
            "auth_url": None, 
            "status": "missing_credentials",
            "message": "Google Cloud OAuth credentials not configured. Please enter your Google Client ID & Secret in the modal."
        }


@router.post("/google/link-account")
async def link_google_account(
    req: LinkGoogleAccountRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    """
    Seamlessly links a Google service (e.g. Google Business Profile) with the project's
    already authenticated Google account from GA4 or Search Console.
    """
    target_project_id = req.project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    # Find connected sibling Google service
    sib_res = await db.execute(
        select(Integration).where(
            Integration.project_id == target_project_id,
            Integration.integration_type.in_(["google_analytics", "search_console"]),
            Integration.connected == True
        )
    )
    sibling = sib_res.scalars().first()
    if not sibling:
        raise HTTPException(
            status_code=400,
            detail="No connected Google account found in this project. Please connect Google Analytics or Search Console first."
        )

    target_res = await db.execute(
        select(Integration).where(
            Integration.project_id == target_project_id,
            Integration.integration_type == req.service
        )
    )
    target_int = target_res.scalars().first()
    if not target_int:
        target_int = Integration(
            project_id=target_project_id,
            integration_type=req.service
        )
        db.add(target_int)

    is_gbp = (req.service == "google_business")
    has_valid_places_key = bool(target_int.api_key and target_int.api_key.startswith("AIza"))

    # Only mark connected for google_business if it actually possesses a valid Places API key
    target_int.connected = True if (not is_gbp or has_valid_places_key) else False
    target_int.access_token = sibling.access_token
    target_int.refresh_token = sibling.refresh_token
    target_int.expires_at = sibling.expires_at
    if sibling.user_id:
        target_int.user_id = sibling.user_id

    sib_cfg = sibling.config_json or {}
    t_cfg = dict(target_int.config_json or {})
    account_email = sib_cfg.get("account_email") or "Authenticated Google Account"
    t_cfg["account_email"] = account_email
    t_cfg["linked_from"] = sibling.integration_type
    t_cfg.pop("last_auth_error", None)
    target_int.config_json = t_cfg
    flag_modified(target_int, "config_json")
    await db.commit()

    if is_gbp and not has_valid_places_key:
        return {
            "status": "pending_key",
            "connected": False,
            "message": f"Associated with {account_email}. Please configure your Google Places API Key to activate live Maps & Business Profile data.",
            "account_email": account_email
        }

    return {
        "status": "success",
        "connected": True,
        "message": f"{req.service.replace('_', ' ').title()} successfully linked with {account_email}!",
        "account_email": account_email
    }


@router.post("/google/callback")
async def google_auth_callback(
    project_id: int, 
    service: str, 
    code: str, 
    redirect_uri: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    if not code:
        raise HTTPException(status_code=400, detail="Missing auth code")
        
    target_project_id = project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    try:
        from app.models.domain import Project
        proj_res = await db.execute(select(Project).where(Project.id == target_project_id))
        proj = proj_res.scalars().first()
        if not proj:
            proj = Project(id=target_project_id, name="Default Project")
            db.add(proj)
            await db.flush()

        result = await db.execute(select(Integration).where(Integration.project_id == target_project_id, Integration.integration_type == service))
        integration = result.scalars().first()
        
        if not integration:
            integration = Integration(
                project_id=target_project_id,
                integration_type=service
            )
            db.add(integration)
            
        if user:
            integration.user_id = user.id
            
        custom_client_id = None
        custom_client_secret = None
        if integration and integration.config_json and isinstance(integration.config_json, dict):
            custom_client_id = integration.config_json.get("client_id")
            custom_client_secret = integration.config_json.get("client_secret")
            
        # Sibling Google service credentials fallback
        if (not custom_client_id or not custom_client_secret) and service in ["search_console", "google_analytics", "google_business"]:
            for sibling in ["search_console", "google_analytics", "google_business"]:
                if sibling == service:
                    continue
                sib_res = await db.execute(select(Integration).where(
                    Integration.project_id == target_project_id,
                    Integration.integration_type == sibling
                ))
                sib_row = sib_res.scalars().first()
                if sib_row and sib_row.config_json and isinstance(sib_row.config_json, dict):
                    if not custom_client_id:
                        custom_client_id = sib_row.config_json.get("client_id")
                    if not custom_client_secret:
                        custom_client_secret = sib_row.config_json.get("client_secret")
                    if custom_client_id and custom_client_secret:
                        break


        google_client_id = (custom_client_id or os.environ.get("GOOGLE_CLIENT_ID", "")).strip().strip('"\'')
        google_client_secret = (custom_client_secret or os.environ.get("GOOGLE_CLIENT_SECRET", "")).strip().strip('"\'')
        
        if not google_client_id or not google_client_secret:
            raise HTTPException(
                status_code=400,
                detail="Google OAuth Client ID & Secret not configured. Please enter them in the setup modal."
            )
        if code.startswith("mock_"):
            raise HTTPException(
                status_code=400,
                detail="Mock OAuth authorization codes are disabled. Please authenticate using genuine Google OAuth credentials."
            )
        
        access_token = None
        refresh_token = None
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=30)
        
        token_endpoint = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": google_client_id,
            "client_secret": google_client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri or "http://localhost:3000/integrations/callback",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(token_endpoint, data=data)
            if res.status_code == 200:
                payload = res.json()
                access_token = payload.get("access_token")
                refresh_token = payload.get("refresh_token")
                expires_in = payload.get("expires_in", 3600)
                expires_at = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in)
                granted_scope = payload.get("scope", "")

                # Check if user actually granted analytics scope
                if service == "google_analytics" and "analytics" not in granted_scope.lower():
                    cfg = dict(integration.config_json or {})
                    err_msg = "Permission not granted: You must check the box for 'See and download your Google Analytics data' on the Google authorization screen."
                    cfg["last_auth_error"] = err_msg
                    cfg["last_auth_attempt"] = datetime.datetime.utcnow().isoformat()
                    integration.config_json = cfg
                    integration.connected = False
                    flag_modified(integration, "config_json")
                    await db.commit()
                    raise HTTPException(status_code=400, detail=err_msg)
            else:
                err_text = res.text
                try:
                    err_json = res.json()
                    err_text = err_json.get("error_description") or err_json.get("error") or err_text
                except Exception:
                    pass
                cfg = dict(integration.config_json or {})
                cfg["last_auth_error"] = f"Token exchange failed: {err_text}"
                cfg["last_auth_attempt"] = datetime.datetime.utcnow().isoformat()
                integration.config_json = cfg
                integration.connected = False
                flag_modified(integration, "config_json")
                await db.commit()
                raise HTTPException(status_code=400, detail=f"Google OAuth token exchange failed: {err_text}")
            
        integration.connected = True
        integration.access_token = access_token
        if refresh_token:
            integration.refresh_token = refresh_token
        integration.expires_at = expires_at

        # Fetch authenticated Google Account user info
        user_email = None
        try:
            async with httpx.AsyncClient(timeout=8.0) as u_client:
                u_res = await u_client.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                if u_res.status_code == 200:
                    user_email = u_res.json().get("email")
        except Exception:
            pass

        # Clear any previous auth error on successful authentication
        cfg = dict(integration.config_json or {})
        cfg.pop("last_auth_error", None)
        if user_email:
            cfg["account_email"] = user_email

        has_no_properties = False
        no_properties_warning = None
        diagnostic_help = None
        callback_status = "success"

        # Auto-discover properties and verify access
        try:
            if service == "google_analytics":
                async with httpx.AsyncClient(timeout=8.0) as admin_client:
                    adm_res = await admin_client.get(
                        "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
                        headers={"Authorization": f"Bearer {access_token}"}
                    )
                    if adm_res.status_code == 200:
                        summaries = adm_res.json().get("accountSummaries", [])
                        total_props = sum(len(acc.get("propertySummaries", [])) for acc in summaries)
                        if total_props == 0 and not cfg.get("selected_property"):
                            has_no_properties = True
                            callback_status = "warning"
                            no_properties_warning = f"Signed in as '{user_email}', but NO GA4 properties were found."
                            diagnostic_help = f"This Google account ({user_email}) has no permissions on any GA4 property. Ensure this account has Viewer or Editor access in Google Analytics (Admin > Property Access Management), or enter your numeric GA4 Property ID manually below."
                        elif not cfg.get("selected_property"):
                            for acc in summaries:
                                prop_summaries = acc.get("propertySummaries", [])
                                if prop_summaries:
                                    first_prop = prop_summaries[0].get("property")
                                    if first_prop:
                                        cfg["selected_property"] = first_prop
                                        break
                    elif adm_res.status_code in [401, 403]:
                        err_j = adm_res.json().get("error", {})
                        err_msg = err_j.get("message", "GA4 Admin API disabled in Google Cloud.")
                        if "disabled" in err_msg.lower() or "not been used in project" in err_msg.lower():
                            err_msg = "Google Analytics Admin API is disabled in your Google Cloud Project. Please enable it in Google Cloud Console, or enter your GA4 Property ID directly."
                        cfg["google_permission_error"] = err_msg
            elif service == "search_console":
                async with httpx.AsyncClient(timeout=8.0) as gsc_client:
                    gsc_res = await gsc_client.get(
                        "https://www.googleapis.com/webmasters/v3/sites",
                        headers={"Authorization": f"Bearer {access_token}"}
                    )
                    if gsc_res.status_code == 200:
                        entries = gsc_res.json().get("siteEntry", [])
                        if len(entries) == 0 and not cfg.get("selected_property"):
                            has_no_properties = True
                            callback_status = "warning"
                            no_properties_warning = f"Signed in as '{user_email}', but NO verified properties were found in Google Search Console."
                            diagnostic_help = f"This Google account ({user_email}) is not an Owner or Full User in Google Search Console for your website. Please add {user_email} in Google Search Console Settings > Users & Permissions, or switch to the Google account that manages your website."
                        elif entries and entries[0].get("siteUrl") and not cfg.get("selected_property"):
                            cfg["selected_property"] = entries[0]["siteUrl"]
                    elif gsc_res.status_code in [401, 403]:
                        err_j = gsc_res.json().get("error", {})
                        err_msg = err_j.get("message", "Permission denied.")
                        if "disabled" in err_msg.lower() or "not been used in project" in err_msg.lower():
                            err_msg += " (Google Search Console API is disabled in your Google Cloud Project)."
                        cfg["google_permission_error"] = err_msg
        except Exception as auto_disc_err:
            print(f"Post-auth auto-discovery notice: {auto_disc_err}")

        cfg["has_no_properties"] = has_no_properties
        cfg["no_properties_warning"] = no_properties_warning
        cfg["diagnostic_help"] = diagnostic_help
        integration.config_json = cfg
        flag_modified(integration, "config_json")
        await db.commit()

        # Trigger immediate telemetry sync if property is selected
        if cfg.get("selected_property"):
            try:
                await IntelligenceService.sync_service_data(db, target_project_id, service)
            except Exception as sync_err:
                print(f"Post-auth telemetry sync notice: {sync_err}")

        return {
            "status": callback_status,
            "code": "no_properties" if has_no_properties else "ok",
            "account_email": user_email,
            "has_no_properties": has_no_properties,
            "no_properties_warning": no_properties_warning,
            "diagnostic_help": diagnostic_help,
            "message": no_properties_warning if has_no_properties else f"{service} connected and authenticated successfully!"
        }
    except HTTPException:
        # Note: We committed last_auth_error before raising, so rollback here won't discard the error message
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to authenticate {service}: {str(e)}")

class RecordOAuthErrorRequest(BaseModel):
    project_id: int = 1
    service: str
    error: str
    error_description: Optional[str] = None

@router.post("/google/record-error")
async def record_oauth_error(
    req: RecordOAuthErrorRequest, 
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    target_project_id = req.project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    result = await db.execute(select(Integration).where(
        Integration.project_id == target_project_id,
        Integration.integration_type == req.service
    ))
    integration = result.scalars().first()
    if not integration:
        integration = Integration(project_id=target_project_id, integration_type=req.service, connected=False)
        db.add(integration)
    
    if user:
        integration.user_id = user.id
    
    cfg = dict(integration.config_json or {})
    err_detail = req.error_description or req.error
    if "access_denied" in err_detail.lower():
        err_detail = "Google Access Denied: If your OAuth app is in 'Testing' mode in Google Cloud Console, you must add your Google email under 'OAuth consent screen' > 'Test users'. Alternatively, paste a Service Account JSON in the modal."
    elif "redirect_uri_mismatch" in err_detail.lower():
        err_detail = f"Redirect URI Mismatch: Please ensure '{req.error_description or 'your callback URL'}' is listed in Google Cloud Console Credentials under Authorized Redirect URIs."
        
    cfg["last_auth_error"] = err_detail
    cfg["last_auth_attempt"] = datetime.datetime.utcnow().isoformat()
    integration.config_json = cfg
    if not cfg.get("selected_property") and not cfg.get("data"):
        integration.connected = False
    flag_modified(integration, "config_json")
    await db.commit()
    return {"status": "recorded", "error": cfg["last_auth_error"]}

@router.post("/clear-error/{project_id}/{service}")
async def clear_integration_error(
    project_id: int, 
    service: str, 
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    target_project_id = project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    result = await db.execute(select(Integration).where(
        Integration.project_id == target_project_id,
        Integration.integration_type == service
    ))
    integration = result.scalars().first()
    if integration and integration.config_json:
        cfg = dict(integration.config_json)
        cfg.pop("last_auth_error", None)
        integration.config_json = cfg
        flag_modified(integration, "config_json")
        await db.commit()
    return {"status": "cleared"}

@router.delete("/disconnect/{project_id}/{service}")
async def disconnect_integration_delete(
    project_id: int, 
    service: str, 
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    target_project_id = project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    try:
        project_ids = list(set([target_project_id, project_id]))
        result = await db.execute(select(Integration).where(
            Integration.project_id.in_(project_ids), 
            Integration.integration_type == service
        ))
        integrations = result.scalars().all()
        
        for integration in integrations:
            await db.delete(integration)
            
        await db.commit()
            
        return {"status": "success", "message": f"{service} disconnected and removed."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to disconnect {service}: {str(e)}")

@router.post("/disconnect")
async def disconnect_integration(
    req: DisconnectRequest, 
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    service = req.service or req.service_name
    if not service:
        raise HTTPException(status_code=400, detail="Service identifier is required")

    target_project_id = req.project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    try:
        project_ids = list(set([target_project_id, req.project_id]))
        result = await db.execute(select(Integration).where(
            Integration.project_id.in_(project_ids), 
            Integration.integration_type == service
        ))
        integrations = result.scalars().all()
        
        for integration in integrations:
            await db.delete(integration)
            
        await db.commit()
            
        return {"status": "success", "message": f"{service} disconnected and removed."}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to disconnect {service}: {str(e)}")


@router.get("/data/{project_id}/{service}")
async def get_integration_data(
    project_id: int, 
    service: str, 
    domain: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    """Retrieves cached integration data (GSC, GA4, GBP, PageSpeed) stored in the database."""
    target_project_id = project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    try:
        data = await IntelligenceService.get_service_data(db=db, project_id=target_project_id, service=service, domain=domain)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch {service} data: {str(e)}")


@router.post("/sync/{project_id}/{service}")
async def sync_integration_data(
    project_id: int, 
    service: str, 
    domain: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    """Forces an on-demand live fetch from the connected external API and updates database cache."""
    target_project_id = project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    try:
        result = await IntelligenceService.sync_service_data(db=db, project_id=target_project_id, service=service, domain=domain)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync {service} data: {str(e)}")


@router.get("/synergy/{crawl_id}")
async def get_audit_synergy(
    crawl_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Cross-correlates crawl audit URLs with connected GSC and GA4 telemetry to surface high-priority SEO opportunities."""
    try:
        synergy_report = await IntelligenceService.get_audit_synergy(db=db, crawl_id=crawl_id)
        return synergy_report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate synergy report: {str(e)}")


@router.post("/ai-analytics-insights/{project_id}")
@router.get("/ai-analytics-insights/{project_id}")
async def get_ai_analytics_insights(
    project_id: int,
    crawl_id: Optional[int] = None,
    domain: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    """
    Synthesizes GA4 + GSC cross-correlated telemetry into an actionable
    SEO, AEO (Answer Engine Optimization) & GEO strategic diagnostic report.
    Token-optimized (~1,100 input / ~500 output tokens) with caching.
    """
    target_project_id = project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    try:
        insights = await IntelligenceService.generate_ai_analytics_strategy(
            db=db,
            project_id=target_project_id,
            crawl_id=crawl_id,
            domain=domain
        )
        return insights
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate AI analytics insights: {str(e)}")


@router.get("/google/properties/{project_id}")
async def get_google_properties(
    project_id: int,
    service: str = "search_console",
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    """Fetches all verified Google Search Console or GA4 properties for the authenticated account."""
    target_project_id = project_id
    if user:
        target_project_id = await get_or_create_user_project(db, user.id)

    result = await db.execute(select(Integration).where(Integration.project_id == target_project_id, Integration.integration_type == service))
    integration = result.scalars().first()
    
    if not integration or not integration.connected:
        return {"connected": False, "properties": [], "message": f"{service.replace('_', ' ').title()} is not connected."}
        
    token = integration.access_token or integration.api_key

    # Direct handling for manual numeric GA4 Property IDs (stored without OAuth token)
    if service == "google_analytics" and token and (token.isdigit() or token.startswith("properties/")):
        clean_pid = token if token.startswith("properties/") else f"properties/{token}"
        num_id = clean_pid.replace("properties/", "")
        return {
            "connected": True,
            "properties": [{
                "siteUrl": clean_pid,
                "name": clean_pid,
                "id": clean_pid,
                "property": clean_pid,
                "propertyId": num_id,
                "displayName": f"GA4 Property ({num_id})",
                "account": "Manual Property ID"
            }],
            "selected_property": clean_pid,
            "has_no_properties": False,
            "message": f"Connected to GA4 Property {num_id}"
        }

    # Direct handling for manual Search Console domain/URL prefix
    if service == "search_console" and token and (token.startswith("sc-domain:") or token.startswith("http://") or token.startswith("https://")):
        return {
            "connected": True,
            "properties": [{
                "siteUrl": token,
                "displayName": token,
                "name": token,
                "id": token,
                "permissionLevel": "siteOwner"
            }],
            "selected_property": token,
            "has_no_properties": False,
            "message": f"Connected to Search Console property {token}"
        }

    if token and token.startswith("{"):
        try:
            from google.oauth2 import service_account
            from google.auth.transport.requests import Request as GoogleRequest
            sa_info = json.loads(token)
            scopes = (
                ["https://www.googleapis.com/auth/webmasters.readonly"]
                if service == "search_console"
                else ["https://www.googleapis.com/auth/analytics.readonly"]
            )
            creds = service_account.Credentials.from_service_account_info(sa_info, scopes=scopes)
            creds.refresh(GoogleRequest())
            token = creds.token
        except Exception as sa_err:
            return {
                "connected": True,
                "properties": [],
                "selected_property": selected,
                "error": f"Failed to refresh Service Account credentials: {str(sa_err)}",
                "message": f"Service Account credential error: {str(sa_err)}"
            }

    if not token or token.startswith("mock_") or token.startswith("oauth_token_"):
        return {
            "connected": False,
            "properties": [],
            "selected_property": None,
            "message": "Not authenticated. Please connect via OAuth."
        }
        
    headers = {"Authorization": f"Bearer {token}"}
    config = dict(integration.config_json or {})
    selected = config.get("selected_property")

    # 1. Google Analytics 4 Properties Discovery
    if service == "google_analytics":
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", headers=headers)
                
                # Auto-refresh token if expired
                if res.status_code == 401:
                    ref_tok = integration.refresh_token
                    if not ref_tok:
                        sib_res = await db.execute(select(Integration).where(
                            Integration.project_id == target_project_id,
                            Integration.integration_type == "search_console"
                        ))
                        sib_int = sib_res.scalars().first()
                        if sib_int and sib_int.refresh_token:
                            integration.refresh_token = sib_int.refresh_token
                            ref_tok = sib_int.refresh_token
                    if ref_tok:
                        new_token = await IntelligenceService.refresh_google_oauth_token(db, integration)
                        if new_token:
                            headers = {"Authorization": f"Bearer {new_token}"}
                            res = await client.get("https://analyticsadmin.googleapis.com/v1beta/accountSummaries", headers=headers)

                if res.status_code == 200:
                    data = res.json()
                    summaries = data.get("accountSummaries", [])
                    properties = []
                    seen_pids = set()
                    for acc in summaries:
                        acc_name = acc.get("displayName", "Account")
                        for p in acc.get("propertySummaries", []):
                            p_id = p.get("property", "")
                            if not p_id or p_id in seen_pids:
                                continue
                            seen_pids.add(p_id)
                            p_name = p.get("displayName", p_id)
                            num_id = p_id.replace("properties/", "")
                            clean_disp = p_name
                            if num_id and f"({num_id})" not in clean_disp and num_id not in clean_disp:
                                clean_disp = f"{p_name} ({num_id})"
                            properties.append({
                                "siteUrl": p_id,
                                "name": p_id,
                                "id": p_id,
                                "property": p_id,
                                "propertyId": num_id,
                                "displayName": clean_disp,
                                "propertyName": p_name,
                                "account": acc_name
                            })

                    has_no_props = len(properties) == 0
                    acc_email = config.get("account_email")
                    if not acc_email:
                        try:
                            u_res = await client.get("https://www.googleapis.com/oauth2/v2/userinfo", headers=headers)
                            if u_res.status_code == 200:
                                acc_email = u_res.json().get("email")
                        except Exception:
                            pass

                    config["has_no_properties"] = has_no_props
                    if acc_email:
                        config["account_email"] = acc_email
                    if has_no_props:
                        config["no_properties_warning"] = f"Signed in as '{acc_email or 'Google User'}', but NO GA4 properties were found."
                        config["diagnostic_help"] = f"This Google account ({acc_email or 'your account'}) does not have Viewer or Editor access to any GA4 property. Ensure this account is granted permissions in Google Analytics (Admin > Property Access Management), enter your numeric Property ID directly below, or switch accounts."
                    else:
                        config["no_properties_warning"] = None
                        config["diagnostic_help"] = None

                    integration.config_json = config
                    flag_modified(integration, "config_json")
                    await db.commit()

                    return {
                        "connected": True,
                        "properties": properties,
                        "selected_property": selected,
                        "has_no_properties": has_no_props,
                        "account_email": acc_email,
                        "no_properties_warning": config.get("no_properties_warning"),
                        "diagnostic_help": config.get("diagnostic_help"),
                        "message": config.get("no_properties_warning") if has_no_props else f"Found {len(properties)} verified GA4 properties."
                    }
                elif res.status_code in [401, 403]:
                    err_json = res.json().get("error", {})
                    err_msg = err_json.get("message", "Permission denied")
                    if "disabled" in err_msg.lower() or "not been used in project" in err_msg.lower():
                        err_msg = "Google Analytics Admin API is disabled in your Google Cloud Project. Enable it in Cloud Console, or enter your GA4 Property ID directly."
                    config["google_permission_error"] = err_msg
                    integration.config_json = config
                    flag_modified(integration, "config_json")
                    await db.commit()
                    return {
                        "connected": True,
                        "properties": [],
                        "selected_property": selected,
                        "requires_manual_id": True,
                        "error": err_msg,
                        "message": err_msg
                    }
                return {"connected": True, "properties": [], "selected_property": selected, "error": f"HTTP {res.status_code}"}
        except Exception as e:
            return {"connected": True, "properties": [], "selected_property": selected, "error": str(e), "requires_manual_id": True}

    # 2. Google Search Console Properties Discovery
    else:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get("https://www.googleapis.com/webmasters/v3/sites", headers=headers)
                
                # Auto-refresh token if expired
                if res.status_code == 401:
                    ref_tok = integration.refresh_token
                    if not ref_tok:
                        sib_res = await db.execute(select(Integration).where(
                            Integration.project_id == target_project_id,
                            Integration.integration_type == "google_analytics"
                        ))
                        sib_int = sib_res.scalars().first()
                        if sib_int and sib_int.refresh_token:
                            integration.refresh_token = sib_int.refresh_token
                            ref_tok = sib_int.refresh_token
                    if ref_tok:
                        new_token = await IntelligenceService.refresh_google_oauth_token(db, integration)
                        if new_token:
                            headers = {"Authorization": f"Bearer {new_token}"}
                            res = await client.get("https://www.googleapis.com/webmasters/v3/sites", headers=headers)

                if res.status_code == 200:
                    data = res.json()
                    entries = data.get("siteEntry", [])
                    seen_urls = set()
                    properties = []
                    for s in entries:
                        s_url = s.get("siteUrl")
                        if s_url and s_url not in seen_urls:
                            seen_urls.add(s_url)
                            properties.append({
                                "siteUrl": s_url,
                                "displayName": s_url,
                                "name": s_url,
                                "id": s_url,
                                "permissionLevel": s.get("permissionLevel", "siteFullUser")
                            })

                    has_no_props = len(properties) == 0
                    acc_email = config.get("account_email")
                    if not acc_email:
                        try:
                            u_res = await client.get("https://www.googleapis.com/oauth2/v2/userinfo", headers=headers)
                            if u_res.status_code == 200:
                                acc_email = u_res.json().get("email")
                        except Exception:
                            pass

                    config["has_no_properties"] = has_no_props
                    if acc_email:
                        config["account_email"] = acc_email
                    if has_no_props:
                        config["no_properties_warning"] = f"Signed in as '{acc_email or 'Google User'}', but NO verified properties were found in Google Search Console."
                        config["diagnostic_help"] = f"This Google account ({acc_email or 'your account'}) is not an Owner or Full User in Google Search Console for any website. Please add {acc_email or 'this email'} in Google Search Console Settings > Users and Permissions, or switch to the Google account that manages your website."
                    else:
                        config["no_properties_warning"] = None
                        config["diagnostic_help"] = None

                    integration.config_json = config
                    flag_modified(integration, "config_json")
                    await db.commit()

                    return {
                        "connected": True,
                        "properties": properties,
                        "selected_property": selected,
                        "has_no_properties": has_no_props,
                        "account_email": acc_email,
                        "no_properties_warning": config.get("no_properties_warning"),
                        "diagnostic_help": config.get("diagnostic_help"),
                        "message": config.get("no_properties_warning") if has_no_props else f"Found {len(properties)} verified properties in Google Search Console."
                    }
                elif res.status_code in [401, 403]:
                    err_json = res.json().get("error", {})
                    err_msg = err_json.get("message", "Permission denied.")
                    if "disabled" in err_msg.lower() or "not been used in project" in err_msg.lower():
                        err_msg += " (Google Search Console API is disabled in your Google Cloud Project)."
                    config["google_permission_error"] = err_msg
                    integration.config_json = config
                    flag_modified(integration, "config_json")
                    await db.commit()
                    return {
                        "connected": True,
                        "properties": [],
                        "selected_property": selected,
                        "error": err_msg,
                        "message": err_msg
                    }
                return {"connected": True, "properties": [], "selected_property": selected, "error": f"Google returned status {res.status_code}", "detail": res.text}
        except Exception as e:
            return {"connected": True, "properties": [], "selected_property": selected, "error": str(e)}


class SelectPropertyRequest(BaseModel):
    project_id: int = 1
    service: str = "search_console"
    property_url: str

@router.post("/google/select-property")
async def select_google_property(
    req: SelectPropertyRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[UserSession] = Depends(get_optional_user)
):
    """Saves user's chosen GSC property or GA4 property, connects integration, and triggers instant telemetry sync."""
    if user:
        req.project_id = await get_or_create_user_project(db, user.id)

    # Ensure parent project exists
    proj_res = await db.execute(select(Project).where(Project.id == req.project_id))
    proj = proj_res.scalars().first()
    if not proj:
        proj = Project(id=req.project_id, name="Default Project")
        db.add(proj)
        await db.flush()

    result = await db.execute(select(Integration).where(Integration.project_id == req.project_id, Integration.integration_type == req.service))
    integration = result.scalars().first()
    if not integration:
        integration = Integration(project_id=req.project_id, integration_type=req.service)
        db.add(integration)
        
    if user:
        integration.user_id = user.id
        
    config = dict(integration.config_json or {})
    clean_prop = req.property_url.strip()
    if req.service == "google_analytics":
        if not clean_prop.startswith("properties/") and clean_prop.isdigit():
            clean_prop = f"properties/{clean_prop}"
            
    config["selected_property"] = clean_prop
    config.pop("last_auth_error", None)
    config.pop("google_permission_error", None)
    config.pop("no_properties_warning", None)
    config["has_no_properties"] = False
    integration.config_json = config
    integration.connected = True
    if not integration.api_key:
        integration.api_key = clean_prop
    flag_modified(integration, "config_json")
    await db.commit()
    
    # Trigger instant sync with the selected property
    try:
        await IntelligenceService.sync_service_data(db, req.project_id, req.service)
    except Exception as e:
        print(f"Sync on property selection notice: {e}")

    return {
        "status": "success", 
        "connected": True, 
        "message": f"Selected property saved as {clean_prop} and connected successfully!", 
        "selected_property": clean_prop
    }



