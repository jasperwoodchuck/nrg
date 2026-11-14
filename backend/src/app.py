from fastapi import FastAPI

app = FastAPI(
    title="Hackathon API",
)


@app.get("/")
async def root():
    return {"message": "API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}
