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
  const notice = useState('auth-flow-notice', () => '')

  function openGate(opts?: { returnTo?: string; notice?: string }) {
    returnTo.value = opts?.returnTo || ''
    notice.value = opts?.notice || ''
    purpose.value = 'login'
    step.value = 'gate'
    open.value = true
  }

  function openLogin(opts?: { returnTo?: string; notice?: string }) {
    returnTo.value = opts?.returnTo || ''
    notice.value = opts?.notice || ''
    purpose.value = 'login'
    step.value = 'login'
    open.value = true
  }

  function openRegister(opts?: { returnTo?: string; role?: AuthFlowRole; notice?: string }) {
    const { pilotNoCoach } = usePilotFlags()
    const requestedRole = opts?.role || 'ATHLETE'
    // Pilot: coach signup is not offered — fall back to role picker (athlete/owner).
    const safeRole = pilotNoCoach.value && requestedRole === 'COACH' ? 'ATHLETE' : requestedRole
    const skipRolePicker = Boolean(opts?.role) && !(pilotNoCoach.value && opts?.role === 'COACH')

    returnTo.value = opts?.returnTo || ''
    notice.value = opts?.notice || ''
    purpose.value = 'register'
    role.value = safeRole
    step.value = skipRolePicker ? 'register' : 'role'
    open.value = true
  }

  function close() {
    open.value = false
    step.value = 'closed'
    notice.value = ''
  }

  return {
    open,
    step,
    role,
    purpose,
    returnTo,
    notice,
    openGate,
    openLogin,
    openRegister,
    close,
  }
}
