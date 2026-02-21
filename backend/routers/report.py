import os
import tempfile
import asyncio
from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import FileResponse
from google import genai
from google.genai import types
from markdown_pdf import MarkdownPdf, Section

router = APIRouter()

@router.get("/report")
async def generate_report(request: Request, scope: str = Query("global"), iso3: str = Query(None)):
    """
    Generates a 2-page PDF report using Gemini based on the current context scale.
    scope: "global" or "country"
    iso3: Country iso3 string (if scope == "country")
    """
    gemini_key = os.getenv("GEMINI_KEY")
    if not gemini_key:
        raise HTTPException(status_code=500, detail="GEMINI_KEY not configured")

    # Access cached Databricks data via the startup lifespan state
    data = getattr(request.app.state, "data", {})
    if not data:
        raise HTTPException(status_code=500, detail="Data not available in app state")

    funding_data = data.get("funding", [])
    
    prompt = ""
    # Structure the prompt based on the scope
    if scope == "country" and iso3:
        # Find country specific info to feed to the LLM
        country_info = [f for f in funding_data if f.get("location_code") == iso3]
        
        country_name = country_info[0].get("location_name") if country_info else iso3
        funding_usd = sum(float(f.get("funding_usd") or 0) for f in country_info)
        req_usd = sum(float(f.get("requirements_usd") or 0) for f in country_info)
        pct = (funding_usd / req_usd * 100) if req_usd > 0 else 0
        
        prompt = f"""
Act as a senior geopolitical analyst presenting to the United Nations. Write a highly detailed, comprehensive intelligence report on the humanitarian crisis in {country_name}.

Context Data:
- Total Funding Requested: ${req_usd:,.2f}
- Total Funding Received: ${funding_usd:,.2f}
- Funding Coverage: {pct:.1f}%

The report MUST be long enough to cover exactly 2 full pages when rendered to a standard PDF font size. Use professional markdown formatting (Headers, Lists, Bold text).

 Structure the report as follows:
 1. Executive Summary
 2. Current Crisis Overview and Historical Context
 3. Financial Analysis (Analyze the funding gap and its implications)
 4. Key Anomalies and Risk Factors
 5. Strategic Recommendations for Donors

Ensure the tone is urgent, analytical, and data-driven.
"""

    else:
        # Global scope
        # Let's just find the top 5 most underfunded countries to give context to Gemini
        grouped = {}
        for f in funding_data:
            iso = f.get("location_code")
            name = f.get("location_name")
            if not iso or not name: continue
            if iso not in grouped:
                grouped[iso] = {"name": name, "req": 0, "fund": 0}
            grouped[iso]["req"] += float(f.get("requirements_usd") or 0)
            grouped[iso]["fund"] += float(f.get("funding_usd") or 0)
        
        # Calculate gaps
        gaps = []
        for iso, stats in grouped.items():
            gap = stats["req"] - stats["fund"]
            if gap > 0:
                gaps.append({"name": stats["name"], "gap": gap})
        
        top_gaps = sorted(gaps, key=lambda x: x["gap"], reverse=True)[:5]
        top_gaps_str = "\n".join([f"- {g['name']}: ${g['gap']:,.2f} shortfall" for g in top_gaps])

        prompt = f"""
Act as a senior geopolitical analyst presenting to the United Nations. Write a highly detailed, comprehensive global intelligence report on worldwide humanitarian funding imbalances.

Context Data (Top 5 Largest Funding Gaps):
{top_gaps_str}

The report MUST be long enough to cover exactly 2 full pages when rendered to a standard PDF font size. Use professional markdown formatting (Headers, Lists, Bold text).

 Structure the report as follows:
 1. Executive Global Summary
 2. Macro-level Funding Deficits Analysis
 3. Regional Deep Dives (Focus on the provided top 5 nations)
 4. Systemic Anomalies in Global Aid Distribution
 5. Strategic Recommendations for the International Community

Ensure the tone is urgent, analytical, and data-driven.
"""

    # Call Gemini (run it in a threadpool since google.genai is sync)
    client = genai.Client(api_key=gemini_key)
    
    def fetch_llm():
        response = client.models.generate_content(
            model='gemini-3-flash-preview',
            contents=prompt,
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_level="high")
            ),
        )
        return response.text

    markdown_content = await asyncio.to_thread(fetch_llm)

    # Generate the PDF
    def generate_pdf(md_text):
        pdf = MarkdownPdf(toc_level=2)
        pdf.add_section(Section(md_text))
        
        # Create a temp file
        fd, temp_path = tempfile.mkstemp(suffix=".pdf")
        os.close(fd) # Close file descriptor, MarkdownPdf handles opening
        pdf.save(temp_path)
        return temp_path

    pdf_path = await asyncio.to_thread(generate_pdf, markdown_content)

    return FileResponse(
        path=pdf_path, 
        filename=f"Report_{scope.capitalize()}.pdf", 
        media_type="application/pdf",
        background=None  # We accept it living in temp until OS clears it for simplicity
    )
