import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  
  const isLoginPage = pathname.startsWith('/login')
  const isAuthRoute = pathname.startsWith('/auth')
  // 🔥 Define a página de redefinição como uma rota permitida
  const isResetPage = pathname.startsWith('/redefinir-senha')

  // 1. Se NÃO tem usuário e a rota NÃO é uma das rotas públicas (login, auth ou redefinir)
  // Redireciona para o login
  if (!user && !isLoginPage && !isAuthRoute && !isResetPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. Se TEM usuário e ele está tentando acessar o /login, manda para o estoque
  // Nota: Não redirecionamos se ele estiver na /redefinir-senha, 
  // pois ele precisa estar "logado" via link de recuperação para mudar a senha.
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/estoque'
    return NextResponse.redirect(url)
  }

  return response
}