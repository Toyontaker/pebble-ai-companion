# Appstore listing

Text and assets for the Pebble appstore (`pebble publish` or the Developer
Dashboard). The appstore takes plain text, so paste the description as is.

| Field | Value |
|---|---|
| Name | AI Companion |
| Category | Tools & Utilities |
| Website | https://github.com/Toyontaker/pebble-ai-companion |
| Source code | https://github.com/Toyontaker/pebble-ai-companion |
| Small icon (80×80) | `store/icon_small_80.png` |
| Large icon (144×144) | `store/icon_large_144.png` |
| Banner (720×320) | `store/banner_720x320.png` |
| Screenshots | `store/screenshots/emery_*.png` (200×228), `store/screenshots/gabbro_*.png` (260×260) |

The answer screenshot (`*_2_answer.png`) shows a sample answer inserted for the
capture, since the emulator has no API key. Replace it with a real capture if you
prefer: set a key, ask "What's the weather today?" and run `pebble screenshot`.

## Description (English)

```
Talk to an AI from your wrist. Press, speak, and get a short answer sized for the screen.

- Ask anything: uses the AI's built-in web search for weather, news, opening hours and more.
- Timers, alarms and reminders: "set a 10 minute pasta timer", "remind me at 6 to call mum". They live on the watch and ring even when your phone is away.
- Timeline pins: hold Select on an answer to keep it, or ask the AI to pin a note.
- Google Calendar (optional): "what's on tomorrow?". Light mode reads your calendar from its secret iCal address. Advanced mode can also add, move and delete events, and asks you to confirm on the watch first.
- Daily brief: weather, your day and one news item in three sentences.
- Touch and sound: swipe and tap on Pebble Time 2 and Round 2; alarm melody on Time 2's speaker (can be turned off).
- English and Japanese.

Bring your own API key: Anthropic Claude, OpenAI or Google Gemini. Usage is billed by that provider to your account. Your questions go straight from your phone to the provider you pick; the developer runs no servers and collects nothing. Location is sent only if you turn it on.

Privacy policy: https://github.com/Toyontaker/pebble-ai-companion/blob/main/PRIVACY.md
Calendar setup: https://github.com/Toyontaker/pebble-ai-companion/blob/main/docs/CALENDAR.md

Needs the current Pebble phone app. Pebble Time 2 and Pebble Round 2.
```

## 説明文（日本語・参考）

```
手首から AI に話しかけられます。ボタンを押して話すだけで、画面に収まる短い答えが返ってきます。

- なんでも質問: 天気・ニュース・営業時間などは AI の組み込み検索で調べて答えます。
- タイマー・アラーム・リマインダー:「10分のパスタタイマー」「6時に母に電話とリマインド」。腕時計に保存されるので、スマホが離れていても鳴ります。
- タイムラインのピン: 回答画面で選択ボタンを長押しすると保存。AI にメモをピン止めさせることもできます。
- Google カレンダー（任意）:「明日の予定は?」。ライトは iCal の非公開アドレスで読むだけ。上級者向けは追加・変更・削除もでき、変更と削除は腕時計で確認してから実行します。
- 今日のまとめ: 天気・今日の予定・ニュースを3文で。
- タッチと音: Pebble Time 2 / Round 2 のスワイプ・タップに対応。Time 2 ではスピーカーでアラームのメロディ（オフ可）。
- 日本語と英語。

API キーはご自身のものを使います（Anthropic Claude / OpenAI / Google Gemini）。利用料は各社からご自身に請求されます。質問はスマホから選んだ AI 会社に直接送られ、開発者はサーバーを持たず、何も収集しません。現在地はオンにしたときだけ送ります。

プライバシーポリシー: https://github.com/Toyontaker/pebble-ai-companion/blob/main/PRIVACY.md
カレンダーの設定: https://github.com/Toyontaker/pebble-ai-companion/blob/main/docs/CALENDAR.md

新しい Pebble スマホアプリが必要です。対応機種: Pebble Time 2、Pebble Round 2。
```

## Release notes (1.0.0)

```
First release.
```

## Publishing

```bash
pebble login
pebble build
pebble publish --no-gif-all-platforms \
  --screenshots store/screenshots/emery_*.png store/screenshots/gabbro_*.png
```

Start the listing as **Unlisted** in the Developer Dashboard to try it by link,
then switch to **Listed**. For later releases, bump `version` in `package.json`
(`major.minor.0`) and run `pebble publish` again.
