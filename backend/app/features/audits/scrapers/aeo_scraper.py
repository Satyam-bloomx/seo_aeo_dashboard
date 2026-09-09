import textstat
import spacy
from bs4 import BeautifulSoup
import extruct

# Load spaCy model lazily to avoid heavy startup if not used
nlp = None

def get_nlp():
    global nlp
    if nlp is None:
        try:
            nlp = spacy.load("en_core_web_sm")
        except Exception:
            # Fallback if not downloaded
            import spacy.cli
            spacy.cli.download("en_core_web_sm")
            nlp = spacy.load("en_core_web_sm")
    return nlp

def analyze_readability(text: str):
    """Calculates the reading level of the content. AEO targets 8th-10th grade."""
    if not text:
        return {"flesch_kincaid_grade": None, "status": "No text provided"}
    
    grade = round(textstat.flesch_kincaid_grade(text), 1)
    is_optimal = 8.0 <= grade <= 10.9
    
    return {
        "flesch_kincaid_grade": grade,
        "is_optimal_for_aeo": is_optimal
    }

def analyze_entities_and_ambiguity(text: str):
    """Uses spaCy to evaluate entity recognition and pronoun density."""
    if not text:
        return {"entity_count": 0, "pronoun_density": 0}
        
    doc = get_nlp()(text[:5000]) # Limit to first 5000 chars for speed
    
    entities = [ent.label_ for ent in doc.ents]
    pronouns = [token.text for token in doc if token.pos_ == "PRON"]
    
    total_words = len([token for token in doc if not token.is_punct])
    pronoun_density = (len(pronouns) / total_words * 100) if total_words > 0 else 0
    
    return {
        "entity_count": len(entities),
        "unique_entity_types": list(set(entities)),
        "pronoun_density_percentage": round(pronoun_density, 2),
        "ambiguity_warning": pronoun_density > 10.0 # Arbitrary threshold for "too many vague pronouns"
    }

def check_direct_answer_format(html: str):
    """Checks for question headings followed directly by answer paragraphs/lists."""
    if not html:
        return {"has_faq_structure": False}
        
    soup = BeautifulSoup(html, "lxml")
    
    # Very rudimentary check: find H2 or H3 that ends with a question mark
    potential_questions = []
    for heading in soup.find_all(['h2', 'h3']):
        text = heading.get_text(strip=True)
        if text.endswith('?'):
            # Check the immediate next sibling
            sibling = heading.find_next_sibling()
            if sibling and sibling.name in ['p', 'ul', 'ol']:
                word_count = len(sibling.get_text(strip=True).split())
                potential_questions.append({
                    "question": text,
                    "answer_word_count": word_count,
                    "is_optimal_length": 40 <= word_count <= 60
                })
                
    return {
        "direct_answers_found": len(potential_questions),
        "details": potential_questions
    }

def validate_faq_schema(html: str, url: str):
    """Validates if FAQ or HowTo schema is present."""
    if not html:
        return {"has_faq_schema": False, "has_howto_schema": False}
    try:
        data = extruct.extract(html, base_url=url, syntaxes=['json-ld'])
        schemas = data.get('json-ld', [])
        
        has_faq = any(s.get('@type') == 'FAQPage' for s in schemas)
        has_howto = any(s.get('@type') == 'HowTo' for s in schemas)
        
        return {
            "has_faq_schema": has_faq,
            "has_howto_schema": has_howto
        }
    except Exception:
        return {"has_faq_schema": False, "has_howto_schema": False}

def check_authority_signals(html: str):
    """Checks for E-E-A-T signals like author bios, contact info, or about pages in links."""
    if not html:
        return {"has_author_bio": False, "has_contact_page": False}
        
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text().lower()
    
    has_bio = "about the author" in text or "written by" in text or "author bio" in text
    
    has_contact = False
    for link in soup.find_all('a'):
        href = str(link.get('href')).lower()
        text_link = link.get_text().lower()
        if "contact" in href or "contact" in text_link or "about" in href or "about" in text_link:
            has_contact = True
            break
            
    return {
        "has_author_bio": has_bio,
        "has_contact_page": has_contact,
        "passes_basic_eeat": has_bio or has_contact
    }

def check_tldr_summary(html: str):
    """Checks if there is a 'Key Takeaways' or 'TL;DR' block at the top of the content."""
    if not html:
        return {"has_tldr": False}
        
    soup = BeautifulSoup(html, "lxml")
    
    # Check the first 2000 characters of visible text for summary keywords
    text = soup.get_text(separator=' ', strip=True)[:2000].lower()
    
    keywords = ["tl;dr", "tldr", "key takeaways", "quick summary", "in this article"]
    has_tldr = any(kw in text for kw in keywords)
    
    return {
        "has_tldr": has_tldr
    }

def check_scannable_format(html: str):
    """Checks for lists and tables to ensure content is easily scannable."""
    if not html:
        return {"is_scannable": False}
        
    soup = BeautifulSoup(html, "lxml")
    has_lists = bool(soup.find(['ul', 'ol']))
    has_tables = bool(soup.find('table'))
    
    return {
        "has_lists": has_lists,
        "has_tables": has_tables,
        "is_scannable": has_lists or has_tables
    }

async def run_aeo_audit(html: str, url: str):
    """Orchestrates the AEO audit checks."""
    soup = BeautifulSoup(html, "lxml")
    
    # Extract visible text from the page, excluding boilerplate
    for invisible in soup(["script", "style", "noscript", "header", "footer", "nav"]):
        invisible.extract()
    text = soup.get_text(separator=' ', strip=True)
    
    readability = analyze_readability(text)
    nlp_analysis = analyze_entities_and_ambiguity(text)
    answer_format = check_direct_answer_format(html)
    schema_validation = validate_faq_schema(html, url)
    authority = check_authority_signals(html)
    tldr = check_tldr_summary(html)
    scannable = check_scannable_format(html)
    
    return {
        "readability": readability,
        "nlp_analysis": nlp_analysis,
        "content_structure": answer_format,
        "schema_validation": schema_validation,
        "authority_signals": authority,
        "summary_blocks": tldr,
        "scannable_format": scannable
    }
