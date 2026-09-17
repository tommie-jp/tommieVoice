import '@testing-library/jest-dom/vitest'

// jsdom は HTMLMediaElement.load() を実装していない。
// RecordingItem の iOS 対策で load() を呼ぶため、no-op で埋めて警告を抑える。
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.load = () => {}
}

// jsdom には Blob URL がない
if (typeof URL.createObjectURL !== 'function') {
  let n = 0
  URL.createObjectURL = () => `blob:test/${++n}`
  URL.revokeObjectURL = () => {}
}

// jsdom の HTMLMediaElement.play/pause は未実装で例外を出すため無害化する
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true })
    this.dispatchEvent(new Event('playing'))
    return Promise.resolve()
  }
  HTMLMediaElement.prototype.pause = function pause(this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true })
    this.dispatchEvent(new Event('pause'))
  }
}

// jsdom に scrollIntoView はない
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
