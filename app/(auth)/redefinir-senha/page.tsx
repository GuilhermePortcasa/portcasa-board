"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react"

export default function RedefinirSenhaPage() {
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true) // Novo: Estado de verificação inicial
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // 1. Verifica se existe uma sessão ativa (vinda do link do e-mail) ao abrir a página
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setError("Sessão não encontrada ou expirada. Solicite um novo link de recuperação.")
      }
      setVerifying(false)
    }
    checkSession()
  }, [supabase])

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    // 2. Tenta atualizar a senha
    const { error: updateError } = await supabase.auth.updateUser({
      password: pin
    })

    if (updateError) {
      // Aqui pegamos a mensagem real do Supabase para saber o que houve
      console.error(updateError)
      setError(updateError.message || "Erro ao atualizar o PIN.")
      setLoading(false)
    } else {
      setSuccess(true)
      // 3. Limpa a sessão antiga para garantir um login fresco
      await supabase.auth.signOut()
      
      setTimeout(() => {
        router.push("/login") // Mandamos para o login para ele entrar com o PIN novo
      }, 2500)
    }
  }

  // Enquanto verifica o link, mostra um loading
  if (verifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm shadow-lg border-t-4 border-t-primary">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold text-primary">PORT<span className="font-light text-foreground">Casa</span></CardTitle>
          <CardDescription>Defina seu novo PIN de acesso</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-sm font-medium text-slate-700">
                PIN atualizado com sucesso!<br/>
                <span className="text-xs text-slate-500">Faça login agora com sua nova senha.</span>
              </p>
            </div>
          ) : (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2 pt-2">
                <Label htmlFor="new-pin">Novo PIN (mínimo 6 dígitos)</Label>
                <Input 
                  id="new-pin" 
                  type="password" 
                  placeholder="******" 
                  maxLength={10} // Permitir mais de 6 por segurança
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  className="text-center tracking-widest font-bold text-2xl h-14"
                  required
                  disabled={!!error} // Bloqueia se o link estiver inválido
                />
              </div>
              
              {error && (
                <div className="bg-destructive/10 p-3 rounded-md flex items-start gap-2 text-destructive text-xs">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full h-12 text-lg" disabled={loading || pin.length < 6 || !!error}>
                {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Redefinir PIN"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}