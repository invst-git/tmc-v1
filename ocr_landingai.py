import os,json
from pathlib import Path
from dotenv import load_dotenv
from landingai_ade import LandingAIADE
from landingai_ade.lib import pydantic_to_json_schema
from invoice_schema import InvoiceExtract

load_dotenv()

def ocr_invoice_to_json(invoice_path:str)->str|None:
    api_key=os.getenv("VISION_AGENT_API_KEY")
    if not api_key:
        return None
    path=Path(invoice_path)
    if not path.exists():
        return None
    model_name=os.getenv("ADE_MODEL","dpt-2-latest")
    environment=os.getenv("ADE_ENVIRONMENT","production")
    if environment.lower()=="eu":
        client=LandingAIADE()
    else:
        client=LandingAIADE()
    parse_response=client.parse(document=path,model=model_name)
    parse_json_path=path.with_suffix(".parse.json")
    with open(parse_json_path,"w",encoding="utf-8") as f:
        json.dump(parse_response.to_dict(),f,ensure_ascii=False,indent=2)
    schema=pydantic_to_json_schema(InvoiceExtract)
    extract_response=client.extract(schema=schema,markdown=parse_response.markdown)
    extract_data=extract_response.extraction
    extract_json_path=path.with_suffix(".fields.json")
    with open(extract_json_path,"w",encoding="utf-8") as f:
        json.dump(extract_data,f,ensure_ascii=False,indent=2)
    return str(extract_json_path)
