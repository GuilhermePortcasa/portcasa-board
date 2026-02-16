import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Aplica a todos os caminhos exceto:
     * - _next/static (arquivos estáticos)
     * - _next/image (otimização de imagens)
     * - favicon.ico (ícone)
     * - /login (página de login)
     * - /auth (rotas de autenticação)
     */
    '/((?!_next/static|_next/image|favicon.ico|login|auth).*)',
  ],
}