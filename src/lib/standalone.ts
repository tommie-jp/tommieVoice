/** iOS でホーム画面から起動しているか */
export function isIosStandalone(nav: Navigator = navigator): boolean {
  const standalone = (nav as Navigator & { standalone?: boolean }).standalone === true
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent)
  return ios && standalone
}
