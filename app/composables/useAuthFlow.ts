export type AuthFlowStep =
  | 'closed'
  | 'gate'
  | 'role'
  | 'register'
  | 'login'
  | 'otp'
  | 'welcome'

/** Phone OTP is the court-MVP primary path; password remains a fallback. */
export type AuthFlowChannel = 'password' | 'otp'

export type AuthFlowRole = 'ATHLETE' | 'COACH' | 'CLUB_ADMIN'

export type AuthWelcomeVariant = 'athlete' | 'owner' | 'login'

function defaultAuthChannel(_smsLive?: boolean): AuthFlowChannel {
  return 'otp'
}

export function useAuthFlow() {
  const open = useState('auth-flow-open', () => false)
  const step = useState<AuthFlowStep>('auth-flow-step', () => 'closed')
  const role = useState<AuthFlowRole>('auth-flow-role', () => 'ATHLETE')
  const purpose = useState<'login' | 'register'>('auth-flow-purpose', () => 'login')
  const channel = useState<AuthFlowChannel>('auth-flow-channel', () => 'otp')
  const returnTo = useState('auth-flow-return-to', () => '')
  const notice = useState('auth-flow-notice', () => '')
  const welcomeVariant = useState<AuthWelcomeVariant>('auth-flow-welcome', () => 'login')
  const pendingRedirect = useState('auth-flow-pending-redirect', () => '')

  function openGate(opts?: { returnTo?: string; notice?: string; channel?: AuthFlowChannel; smsLive?: boolean }) {
    returnTo.value = opts?.returnTo || ''
    notice.value = opts?.notice || ''
    purpose.value = 'login'
    channel.value = opts?.channel || defaultAuthChannel(opts?.smsLive)
    step.value = 'gate'
    open.value = true
  }

  function openLogin(opts?: { returnTo?: string; notice?: string; channel?: AuthFlowChannel; smsLive?: boolean }) {
    returnTo.value = opts?.returnTo || ''
    notice.value = opts?.notice || ''
    purpose.value = 'login'
    channel.value = opts?.channel || defaultAuthChannel(opts?.smsLive)
    step.value = 'login'
    open.value = true
  }

  function openRegister(opts?: {
    returnTo?: string
    role?: AuthFlowRole
    notice?: string
    channel?: AuthFlowChannel
    smsLive?: boolean
  }) {
    const config = useRuntimeConfig()
    const coachFrozen = Boolean(config.public.pilotNoCoach)
    const requestedRole = opts?.role || 'ATHLETE'
    // PILOT_NO_COACH: never open coach signup even if a deep-link asks for it.
    const roleSafe = coachFrozen && requestedRole === 'COACH' ? 'ATHLETE' : requestedRole
    const skipRolePicker = Boolean(opts?.role) && !(coachFrozen && requestedRole === 'COACH')

    returnTo.value = opts?.returnTo || ''
    notice.value = opts?.notice || ''
    purpose.value = 'register'
    channel.value = opts?.channel || defaultAuthChannel(opts?.smsLive)
    role.value = roleSafe
    step.value = skipRolePicker ? 'register' : 'role'
    open.value = true
  }

  function close() {
    open.value = false
    step.value = 'closed'
    channel.value = 'otp'
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
