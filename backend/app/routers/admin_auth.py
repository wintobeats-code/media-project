from app.core.dependencies import get_current_admin
from app.schemas.auth import LoginRequest, Token
from app.services.auth import AuthService
from fastapi import APIRouter, Depends, HTTPException, Response, status

router = APIRouter(prefix="/api/admin", tags=["admin-auth"])


@router.post("/auth/login", response_model=Token)
async def login(request: LoginRequest, response: Response):
    token = AuthService.authenticate(request.username, request.password)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    response.set_cookie(
        key="access_token",
        value=f"Bearer {token.access_token}",
        # ВНИМАНИЕ: не httponly — админка (vanilla JS) читает эту куку, чтобы
        # отправлять заголовок Authorization для запросов /api/admin/*. Сами
        # страницы админки также полагаются на доступ через куку на сервере.
        max_age=3600,
        samesite="lax",
    )
    return token


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Logged out"}


@router.get("/auth/me")
async def check_auth(admin: str = Depends(get_current_admin)):
    return {"username": admin}
