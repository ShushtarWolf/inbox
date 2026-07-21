export type AuthFlowStep =
  | 'closed'
  | 'role'
  | 'register'
  | 'login'
  | 'otp'

export type AuthFlowLoginMode = 'password' | 'phone'

export type AuthFlowRole = 'ATHLETE' | 'COACH' | 'CLUB_ADMIN'

export function useAuthFlow() {
  const open = useState('auth-flow-open', () => false)
  const step = useState<AuthFlowStep>('auth-flow-step', () => 'closed')
  const role = useState<AuthFlowRole>('auth-flow-role', () => 'ATHLETE')
  const purpose = useState<'login' | 'register'>('auth-flow-purpose', () => 'login')
  const loginMode = useState<AuthFlowLoginMode>('auth-flow-login-mode', () => 'password')
  const returnTo = useState('auth-flow-return-to', () => '')

  function openGate(opts?: { returnTo?: string }) {
    openLogin(opts)
  }

  function openLogin(opts?: { returnTo?: string; mode?: AuthFlowLoginMode }) {
    returnTo.value = opts?.returnTo || ''
    purpose.value = 'login'
    loginMode.value = opts?.mode || 'password'
    step.value = 'login'
    open.value = true
  }

  function openRegister(opts?: { returnTo?: string; role?: AuthFlowRole }) {
    const { pilotNoCoach } = usePilotFlags()
    const requestedRole = opts?.role || 'ATHLETE'
    // Pilot: coach signup is not offered — fall back to role picker (athlete/owner).
    const safeRole = pilotNoCoach.value && requestedRole === 'COACH' ? 'ATHLETE' : requestedRole
    const skipRolePicker = Boolean(opts?.role) && !(pilotNoCoach.value && opts?.role === 'COACH')

    returnTo.value = opts?.returnTo || ''
    purpose.value = 'register'
    role.value = safeRole
    step.value = skipRolePicker ? 'register' : 'role'
    open.value = true
  }

  function close() {
    open.value = false
    step.value = 'closed'
    loginMode.value = 'password'
  }

  return {
    open,
    step,
    role,
    purpose,
    loginMode,
    returnTo,
    openGate,
    openLogin,
    openRegister,
    close,
  }
}
