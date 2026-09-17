import type { NgWordChecker } from './ngWords.ts'

export const SUMMARY_MAX_CHARS = 60

export type Triage = { summary: string; tags: string[]; riskFlags: string[] }

const QUESTION = /[?？]|教えて|ですか|ますか|でしょうか|どう思/
const REQUEST = /お願い|してください|して欲しい|してほしい|読んで|言って/
const GREETING = /^(こんにちは|こんばんは|はじめまして|初めまして|おはよう|どうも)/
const CONTACT = [
  /\d{2,4}[-‐ー]\d{2,4}[-‐ー]\d{3,4}/, // 電話番号
  /[\w.+-]+@[\w-]+\.[\w.-]+/, // メール
  /https?:\/\/\S+/i, // URL
  /(line|ライン)\s*(id|ＩＤ|アイディー)/i,
]

function summarize(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const chars = [...flat]
  return chars.length <= SUMMARY_MAX_CHARS
    ? flat
    : `${chars.slice(0, SUMMARY_MAX_CHARS - 1).join('')}…`
}

/** 文字起こしから一行要約・タグ・要注意フラグを作る（設計メモ 04 §5 の MVP、LLM は使わない） */
export function triage(text: string, opts: { hasScript: boolean; ngWords: NgWordChecker }): Triage {
  const body = text.trim()
  const tags: string[] = []
  if (opts.hasScript) tags.push('script')
  if (QUESTION.test(body)) tags.push('question')
  if (REQUEST.test(body)) tags.push('request')
  if (GREETING.test(body)) tags.push('greeting')

  const riskFlags: string[] = []
  if ([...body].length < 2) riskFlags.push('empty')
  if (opts.ngWords.matches(body)) riskFlags.push('ng_word')
  if (CONTACT.some((re) => re.test(body))) riskFlags.push('contact_info')

  return { summary: summarize(body), tags, riskFlags }
}
