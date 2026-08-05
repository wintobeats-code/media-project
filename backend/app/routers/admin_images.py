from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.dependencies import CurrentAdmin
from app.services.image import ImageService

router = APIRouter(prefix="/api/admin/images", tags=["admin-images"])


@router.post("/upload")
async def upload_image(
    admin: CurrentAdmin,
    file: UploadFile = File(...),
):
    try:
        url = await ImageService.save_upload(file)
        return {"url": url, "filename": file.filename}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/upload-multiple")
async def upload_images(
    admin: CurrentAdmin,
    files: List[UploadFile] = File(...),
):
    urls = []
    for file in files:
        try:
            url = await ImageService.save_upload(file)
            urls.append({"url": url, "filename": file.filename})
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    return {"images": urls}
