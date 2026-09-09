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
    model_name = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
    model = genai.GenerativeModel(model_name)
    fallback_model = genai.GenerativeModel("gemini-2.5-flash-lite")
else:
    model = None
    fallback_model = None

async def generate_with_fallback(prompt: str):
    """Attempts to generate content with primary model, falls back if it errors."""
    try:
        return await model.generate_content_async(prompt)
    except Exception as e:
        print(f"Primary model failed ({e}), falling back to gemini-2.5-flash-lite")
        return await fallback_model.generate_content_async(prompt)

async def check_brand_with_gemini(url: str, raw_html: str = None):
    """
    Tests Generative Engine Optimization by using a two-step AI prompt.
    1. Extracts context (Brand Name, Target Query) from the page HTML.
    2. Simulates an AI search for that query to see if the brand is cited.
    """
    if not model:
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
