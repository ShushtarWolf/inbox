export type AuthFlowStep =
  | 'closed'
  | 'gate'
  | 'role'
  | 'register'
  | 'login'
  | 'otp'

export type AuthFlowRole = 'ATHLETE' | 'COACH' | 'CLUB_ADMIN'

export function useAuthFlow() {
  const open = useState('auth-flow-open', () => false)
  const step = useState<AuthFlowStep>('auth-flow-step', () => 'closed')
  const role = useState<AuthFlowRole>('auth-flow-role', () => 'ATHLETE')
  const purpose = useState<'login' | 'register'>('auth-flow-purpose', () => 'login')
  const returnTo = useState('auth-flow-return-to', () => '')

  function openGate(opts?: { returnTo?: string }) {
    returnTo.value = opts?.returnTo || ''
    step.value = 'gate'
    open.value = true
  }

  function openLogin(opts?: { returnTo?: string }) {
    returnTo.value = opts?.returnTo || ''
    purpose.value = 'login'
    step.value = 'login'
    open.value = true
  }

  function openRegister(opts?: { returnTo?: string; role?: AuthFlowRole }) {
    returnTo.value = opts?.returnTo || ''
    purpose.value = 'register'
    role.value = opts?.role || 'ATHLETE'
    step.value = opts?.role ? 'register' : 'role'
    open.value = true
  }

  function close() {
    open.value = false
    step.value = 'closed'
  }

  return {
    open,
    step,
    role,
    purpose,
    returnTo,
    openGate,
    openLogin,
    openRegister,
    close,
  }
}
