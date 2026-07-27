export type AuthFlowStep =
  | 'closed'
  | 'gate'
  | 'role'
  | 'register'
  | 'login'
  | 'otp'
  | 'welcome'

/** Password is the MVP launch path; OTP remains for live SMS cutover. */
export type AuthFlowChannel = 'password' | 'otp'

export type AuthFlowRole = 'ATHLETE' | 'COACH' | 'CLUB_ADMIN'

export type AuthWelcomeVariant = 'athlete' | 'owner' | 'login'

export function useAuthFlow() {
  const open = useState('auth-flow-open', () => false)
  const step = useState<AuthFlowStep>('auth-flow-step', () => 'closed')
  const role = useState<AuthFlowRole>('auth-flow-role', () => 'ATHLETE')
  const purpose = useState<'login' | 'register'>('auth-flow-purpose', () => 'login')
  const channel = useState<AuthFlowChannel>('auth-flow-channel', () => 'password')
  const returnTo = useState('auth-flow-return-to', () => '')
  const notice = useState('auth-flow-notice', () => '')
  const welcomeVariant = useState<AuthWelcomeVariant>('auth-flow-welcome', () => 'login')
  const pendingRedirect = useState('auth-flow-pending-redirect', () => '')

  function openGate(opts?: { returnTo?: string; notice?: string }) {
    returnTo.value = opts?.returnTo || ''
    notice.value = opts?.notice || ''
    purpose.value = 'login'
    channel.value = 'password'
    step.value = 'gate'
    open.value = true
  }

  function openLogin(opts?: { returnTo?: string; notice?: string; channel?: AuthFlowChannel }) {
    returnTo.value = opts?.returnTo || ''
    notice.value = opts?.notice || ''
    purpose.value = 'login'
    channel.value = opts?.channel || 'password'
    step.value = 'login'
    open.value = true
  }

  function openRegister(opts?: {
    returnTo?: string
    role?: AuthFlowRole
    notice?: string
    channel?: AuthFlowChannel
  }) {
    const requestedRole = opts?.role || 'ATHLETE'
    // Product exclusion: Coach signup is never offered — fall back to athlete/owner picker.
    const safeRole = requestedRole === 'COACH' ? 'ATHLETE' : requestedRole
    const skipRolePicker = Boolean(opts?.role) && opts?.role !== 'COACH'

    returnTo.value = opts?.returnTo || ''
    notice.value = opts?.notice || ''
    purpose.value = 'register'
    channel.value = opts?.channel || 'password'
    role.value = safeRole
    step.value = skipRolePicker ? 'register' : 'role'
    open.value = true
  }

  function close() {
    open.value = false
    step.value = 'closed'
    channel.value = 'password'
    notice.value = ''
    pendingRedirect.value = ''
  }

  return {
    open,
    step,
    role,
    purpose,
    channel,
    returnTo,
    notice,
    welcomeVariant,
    pendingRedirect,
    openGate,
    openLogin,
    openRegister,
    close,
  }
}
