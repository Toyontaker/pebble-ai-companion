# Privacy Policy — AI Companion for Pebble

*Last updated: 2026-10-13* · [日本語は下にあります](#プライバシーポリシー日本語)

AI Companion is a Pebble watchapp with a companion script that runs inside the
Pebble phone app. **The developer runs no servers and collects nothing.** There
are no analytics, no accounts and no tracking. What leaves your phone goes
directly to the services you choose, as described below.

## What stays on your phone and watch

- Your settings, including your AI provider API keys, the calendar addresses and
  the calendar secret. They are stored in the Pebble app's storage on your phone.
- Facts the AI was asked to remember (at most 20). You can erase them in the
  settings ("Erase remembered facts").
- Timers, alarms and reminders. They are stored on the watch.
- Timeline pins. They are created on your phone by the Pebble app and synced to
  your watch.

## What is sent to your AI provider

Each time you ask something, the phone sends a request to the provider you
selected (Anthropic, OpenAI or Google) using **your own API key**. The request
contains:

- your question (dictated text or a quick phrase) and the conversation from the
  last 10 minutes;
- the current date, time and timezone;
- the labels and times of the timers, alarms and reminders on your watch;
- the facts you asked the AI to remember, and your "extra instructions";
- **your approximate location (latitude and longitude), only if you turned on
  "Send my location to the AI".** It is off by default;
- when the AI looks at your Google Calendar, the events it read (titles, times,
  locations, calendar names).

If web search is allowed, the provider may search the web on your behalf.
The provider handles this data under its own terms and privacy policy:

- Anthropic: <https://www.anthropic.com/legal/privacy>
- OpenAI: <https://openai.com/policies/privacy-policy>
- Google: <https://policies.google.com/privacy>

Charges for API use are billed by your provider to your account.

## Google Calendar (optional, off by default)

- **Light mode** (read only): the phone downloads your calendar's secret iCal
  address directly from Google. The address is stored only on your phone.
- **Advanced mode** (read and write): the phone talks to a Google Apps Script
  that **you deploy in your own Google account**. It runs under your account,
  and nobody else operates it. Anyone who has both its URL and its secret can
  read and change your calendar, so keep them private.

## Location

Location is used only when "Send my location to the AI" is on, and only to send
an approximate position with your question. It is never stored by the app.

## Logs

For troubleshooting, the phone script writes technical logs (provider name,
model, request URLs with secret parts masked, error messages). They stay in the
Pebble app and are visible only through developer tools such as `pebble logs`.
They do not contain your API key or your questions.

## Children

The app is not directed at children under 13.

## Changes and contact

Changes to this policy are published in this repository. Questions:
<https://github.com/Toyontaker/pebble-ai-companion/issues>

---

# プライバシーポリシー（日本語）

*最終更新: 2026-10-13*

AI Companion は Pebble 用の腕時計アプリと、Pebble スマホアプリの中で動くスクリプトで
できています。**開発者はサーバーを運用しておらず、何も収集しません。**
アクセス解析・アカウント・トラッキングはありません。スマホの外に出るデータは、
以下のとおり、あなたが選んだサービスへ直接送られます。

## スマホと腕時計の中だけにあるもの

- 設定（AI プロバイダの API キー、カレンダーのアドレス・合言葉を含む）。スマホの
  Pebble アプリ内に保存されます。
- AI に覚えさせた事実（最大 20 件）。設定画面の「記憶した内容を消去する」で消せます。
- タイマー・アラーム・リマインダー。腕時計に保存されます。
- タイムラインのピン。スマホの Pebble アプリが作り、腕時計に同期します。

## AI プロバイダに送るもの

質問のたびに、選んだプロバイダ（Anthropic / OpenAI / Google）へ **あなた自身の API キー**
でリクエストを送ります。中身は次のとおりです。

- 質問（音声入力の文字起こしや定型文）と、直近 10 分の会話
- 現在の日時とタイムゾーン
- 腕時計に入っているタイマー・アラーム・リマインダーの名前と時刻
- AI に覚えさせた事実と「追加の指示」
- **おおよその現在地（緯度・経度）。設定で「現在地を AI に送る」をオンにしたときだけ**です。既定はオフです
- AI が Google カレンダーを見たときは、読み取った予定（名前・時刻・場所・カレンダー名）

インターネット検索を許可している場合、プロバイダがあなたの代わりに検索することがあります。
送ったデータは各プロバイダの規約とプライバシーポリシーに従って扱われます（リンクは英語版を参照）。
API の利用料は、プロバイダからあなたのアカウントに直接請求されます。

## Google カレンダー（任意・既定はオフ）

- **ライト**（読むだけ）: スマホが Google から、カレンダーの「iCal 形式の非公開アドレス」を
  直接ダウンロードします。アドレスはスマホにだけ保存されます。
- **上級者向け**（読み書き）: スマホは、**あなたが自分の Google アカウントにデプロイした**
  Apps Script と通信します。あなたのアカウントで動き、他の誰も運用していません。
  URL と合言葉の両方を知っている人はカレンダーを読み書きできるので、他人に教えないでください。

## 位置情報

「現在地を AI に送る」がオンのときだけ、質問と一緒におおよその位置を送るために使います。
アプリが位置情報を保存することはありません。

## ログ

不具合調査のため、スマホ側のスクリプトは技術的なログ（プロバイダ名、モデル、秘密の部分を
伏せたリクエスト URL、エラー内容）を出力します。ログは Pebble アプリの中にとどまり、
`pebble logs` などの開発者向けツールでしか見られません。API キーや質問の内容は含みません。

## 子ども

13 歳未満の子どもを対象としたアプリではありません。

## 変更と問い合わせ

このポリシーの変更はこのリポジトリで公開します。問い合わせ:
<https://github.com/Toyontaker/pebble-ai-companion/issues>
