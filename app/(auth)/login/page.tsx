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
  const [successMsg, setSuccessMsg] = useState("")
  const [isResetMode, setIsResetMode] = useState(false) // Novo estado para alternar entre Login e Reset
  const router = useRouter()
  const supabase = createClient()

  // --- LÓGICA DE LOGIN ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccessMsg("")
    
    const email = username.toLowerCase().trim()
    const password = pin 

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

// --- LÓGICA DE RECUPERAÇÃO DE SENHA ---
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccessMsg("")

    const email = username.toLowerCase().trim()

    if (!email) {
      setError("Por favor, preencha o e-mail.")
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Redireciona para a nova tela que vamos criar
      redirectTo: `${window.location.origin}/redefinir-senha`, 
    })

    if (error) {
      // Se a trava do Supabase foi desativada (Passo 1), ele retornará esse erro para contas falsas
      if (error.status === 400 || error.message.toLowerCase().includes("not found")) {
        setError("Este e-mail não está cadastrado no sistema.")
      } else {
        setError("Erro ao tentar enviar o e-mail de recuperação.")
      }
    } else {
      setSuccessMsg("E-mail enviado! Verifique sua caixa de entrada ou spam.")
    }
    setLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm shadow-lg border-t-4 border-t-primary">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold text-primary">PORT<span className="font-light text-foreground">Casa</span></CardTitle>
          <CardDescription>
            {isResetMode ? "Recuperação de PIN" : "Acesso ao Dashboard Executivo"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* O form chama a função certa dependendo do modo */}
          <form onSubmit={isResetMode ? handleResetPassword : handleLogin} className="space-y-4">
            
            <div className="space-y-2">
              <Label htmlFor="e-mail">E-mail</Label>
              <Input 
                id="e-mail" 
                placeholder="Ex: user@email.com" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
            
            {/* Esconde o campo de PIN se estiver no modo de recuperação */}
            {!isResetMode && (
              <div className="space-y-2">
                <Label htmlFor="pin">PIN (6 dígitos)</Label>
                <Input 
                  id="pin" 
                  type="password" 
                  placeholder="******" 
                  maxLength={6} // Alterado para 6
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="text-center tracking-widest font-bold text-lg"
                  required={!isResetMode}
                />
              </div>
            )}
            
            {/* Mensagens de feedback */}
            {error && <p className="text-sm text-destructive text-center font-medium">{error}</p>}
            {successMsg && <p className="text-sm text-green-600 text-center font-medium">{successMsg}</p>}

            {/* Botão de Submit Dinâmico */}
            <Button type="submit" className="w-full" disabled={loading || (!isResetMode && pin.length < 4)}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isResetMode ? "Receber link por E-mail" : "Entrar")}
            </Button>

            {/* Botão para alternar entre as telas */}
            <div className="text-center mt-2">
              <Button 
                type="button" 
                variant="link" 
                className="text-xs text-muted-foreground"
                onClick={() => {
                  setIsResetMode(!isResetMode)
                  setError("")
                  setSuccessMsg("")
                }}
              >
                {isResetMode ? "Voltar para o Login" : "Esqueceu seu PIN?"}
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>
    </div>
  )
}