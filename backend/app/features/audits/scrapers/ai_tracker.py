import os
import json
import warnings
with warnings.catch_warnings():
    warnings.simplefilter("ignore", category=FutureWarning)
    import google.generativeai as genai
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

# Initialize the Gemini client
api_key = os.getenv("GEMINI_API_KEY")
if api_key and api_key != "your_key_here":
    genai.configure(api_key=api_key)
    model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    model = genai.GenerativeModel(model_name)
    fallback_model = genai.GenerativeModel("gemini-3.5-flash-lite")
else:
    model = None
    fallback_model = None

def get_gemini_models(custom_key: str = None):
    global model, fallback_model
    k = custom_key or os.getenv("GEMINI_API_KEY")
    if k and k != "your_key_here":
        try:
            genai.configure(api_key=k)
            m_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
            m = genai.GenerativeModel(m_name)
            fb = genai.GenerativeModel("gemini-3.5-flash-lite")
            return m, fb
        except Exception as e:
            print(f"Gemini init error: {e}")
    return model, fallback_model

async def generate_with_fallback(prompt: str, m=None, fb=None):
    """Attempts to generate content with primary model, falls back if it errors."""
    target_m = m or model
    target_fb = fb or fallback_model
    try:
        return await target_m.generate_content_async(prompt)
    except Exception as e:
        print(f"Primary model failed ({e}), falling back to gemini-3.5-flash-lite")
        if target_fb:
            return await target_fb.generate_content_async(prompt)
        raise

async def check_brand_with_gemini(url: str, raw_html: str = None, api_key_override: str = None):
    """
    Tests Generative Engine Optimization by using a two-step AI prompt.
    1. Extracts context (Brand Name, Target Query) from the page HTML.
    2. Simulates an AI search for that query to see if the brand is cited.
    """
    active_m, active_fb = get_gemini_models(api_key_override)
    if not active_m:
        return {
            "status": "skipped",
            "message": "Gemini API key not configured or invalid.",
            "is_cited": False
        }
        
    title = ""
    h1 = ""
    domain = urlparse(url).netloc
    
    if raw_html:
        soup = BeautifulSoup(raw_html, "html.parser")
        if soup.title:
            title = soup.title.string
        h1_tag = soup.find('h1')
        if h1_tag:
            h1 = h1_tag.get_text(strip=True)
            
    current_date = datetime.now().strftime("%Y-%m-%d")
            
    # Step 1: Context Extraction Prompt
    extraction_prompt = f"""
    Current Date: {current_date}
    Analyze the following website metadata:
    URL Domain: {domain}
    Title: {title}
    H1: {h1}
    
    Return a JSON object with two keys:
    "brand_name": The likely brand or company name.
    "target_query": A generic query a user would type into a search engine to look for this exact type of business or software (do not include the brand name in the query).
    Return ONLY valid JSON.
    """
    
    try:
        # Step 1: Get Context
        extraction_response = await generate_with_fallback(extraction_prompt)
        text_resp = extraction_response.text.strip()
        
        # Strip markdown json blocks if present
        if text_resp.startswith("```json"):
            text_resp = text_resp[7:]
        if text_resp.endswith("```"):
            text_resp = text_resp[:-3]
            
        context = json.loads(text_resp)
        brand_name = context.get("brand_name", domain)
        target_query = context.get("target_query", f"services related to {domain}")
        
        # Step 2: Answer Engine Simulation
        simulation_prompt = f"Current Date: {current_date}\\nYou are a helpful AI assistant. Answer this query: {target_query}"
        simulation_response = await generate_with_fallback(simulation_prompt)
        ai_answer = simulation_response.text
        
        # Step 3: Visibility Validation
        is_cited = False
        if brand_name.lower() in ai_answer.lower():
            is_cited = True
        elif domain.lower() in ai_answer.lower():
            is_cited = True
            
        # Clean domain (e.g. example.com -> example)
        base_domain = domain.split('.')[0]
        if len(base_domain) > 3 and base_domain.lower() in ai_answer.lower():
            is_cited = True
            
        return {
            "status": "success",
            "extracted_brand": brand_name,
            "target_query": target_query,
            "is_cited": is_cited,
            "ai_snippet": ai_answer[:200] + "..." if len(ai_answer) > 200 else ai_answer
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "is_cited": False
        }
