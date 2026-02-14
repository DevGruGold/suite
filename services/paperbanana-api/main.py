
import os
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import google.generativeai as genai
from paperbanana import PaperBananaPipeline, GenerationInput, DiagramType
from paperbanana.core.config import Settings
import asyncio
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="PaperBanana API", description="API for generating academic diagrams and plots using PaperBanana")

# Initialize PaperBanana Pipeline
try:
    settings = Settings(
        vlm_provider="gemini",
        image_provider="google_imagen", # Or whatever is configured/available
        refinement_iterations=3,
    )
    # Check for API key
    if not os.getenv("GOOGLE_API_KEY"):
        logger.warning("GOOGLE_API_KEY not found in environment variables. PaperBanana functionality will be limited.")
    
    pipeline = PaperBananaPipeline(settings=settings)
except Exception as e:
    logger.error(f"Failed to initialize PaperBanana pipeline: {e}")
    pipeline = None

class GenerateRequest(BaseModel):
    source_context: str
    communicative_intent: str
    diagram_type: str = "methodology" # methodology, architecture, process, etc.
    caption: Optional[str] = None
    refinement_iterations: Optional[int] = 3

class PlotRequest(BaseModel):
    data: List[Dict[str, Any]] # Array of objects
    intent: str
    caption: Optional[str] = None

@app.get("/")
def read_root():
    return {"message": "PaperBanana API is running"}

@app.get("/health")
def health_check():
    if pipeline:
        return {"status": "ok", "pipeline": "initialized"}
    else:
        return {"status": "error", "pipeline": "failed_to_initialize"}

@app.post("/generate")
async def generate_diagram(request: GenerateRequest):
    if not pipeline:
        raise HTTPException(status_code=500, detail="PaperBanana pipeline not initialized")
    
    try:
        # Map string type to Enum if necessary
        diagram_type_enum = DiagramType.METHODOLOGY
        if request.diagram_type.lower() == "architecture":
            diagram_type_enum = DiagramType.ARCHITECTURE
        elif request.diagram_type.lower() == "process":
            diagram_type_enum = DiagramType.PROCESS_FLOW
            
        input_data = GenerationInput(
            source_context=request.source_context,
            communicative_intent=request.communicative_intent,
            diagram_type=diagram_type_enum
        )
        
        # Run generation
        # Note: pipeline.generate might be async or sync depending on library version. 
        # Analyzing the snippet in README, it's awaited: await pipeline.generate(...)
        # But the snippet showed `asyncio.run(pipeline.generate(...))` implying it is async.
        result = await pipeline.generate(input_data)
        
        # Return result - assuming result has image_path or similar
        # In a real API, we'd probably upload this image to storage (S3/GCS) and return a detailed URL
        # For this MVP, we might return the local path or base64 encoded string if small enough.
        # Let's assume we return metadata for now.
        
        return {
            "success": True, 
            "image_path": str(result.image_path), # Convert path to string
            "metadata": result.metadata if hasattr(result, "metadata") else {}
        }

    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/plot")
async def generate_plot(request: PlotRequest):
    # Placeholder for plot generation logic
    # PaperBanana might have a separate method for plots
    return {"error": "Not implemented yet"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
