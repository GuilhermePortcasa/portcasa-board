"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    const email = `${username.toLowerCase().trim()}`
    const password = `${pin}` 

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError("Usuário ou PIN incorretos.")
      setLoading(false)
    } else {
      router.push("/estoque") // Redireciona para o dashboard
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm shadow-lg border-t-4 border-t-primary">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold text-primary">PORT<span className="font-light text-foreground">Casa</span></CardTitle>
          <CardDescription>Acesso ao Dashboard Executivo</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">E-mail</Label>
              <Input 
                id="e-mail" 
                placeholder="Ex: user@email.com" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN (4 dígitos)</Label>
              <Input 
                id="pin" 
                type="password" 
                placeholder="****" 
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} // Só aceita números
                className="text-center tracking-widest font-bold text-lg"
                required
              />
            </div>
            
            {error && <p className="text-sm text-destructive text-center font-medium">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading || pin.length < 4}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}