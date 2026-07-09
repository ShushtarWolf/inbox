export function useOwnerClubRefresh(refresh: () => void | Promise<void>) {
  const ownerClubVersion = inject<Ref<number>>('ownerClubVersion')

  if (ownerClubVersion) {
    watch(ownerClubVersion, () => refresh())
  }
}
