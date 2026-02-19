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

  const isLoginPage = request.nextUrl.pathname.startsWith('/login')
  const isAuthRoute = request.nextUrl.pathname.startsWith('/auth')

  // 1. Se NÃO tem usuário e a rota NÃO é de login nem de auth, redireciona para /login
  if (!user && !isLoginPage && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // 2. Se TEM usuário e ele está tentando acessar o /login, redireciona para /estoque
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/estoque' // ou '/' dependendo de qual for a sua página principal
    return NextResponse.redirect(url)
  }

  return response
}