# Google Calendar setup

[日本語は下にあります](#google-カレンダー連携の設定)

AI Companion can answer "what's on tomorrow?" from your Google Calendar. There
are two ways to connect it. Pick one under **Google Calendar → Connection** in
the app settings (Pebble phone app → AI Companion → Settings).

| | Light | Advanced |
|---|---|---|
| Read events | ✓ | ✓ |
| Add, move, rename, delete | – | ✓ (changes and deletes are confirmed on the watch first) |
| Calendars | the one calendar whose address you paste | every calendar you have ticked in Google Calendar |
| Setup | copy one address (2 minutes) | deploy a small Apps Script in your account (5 minutes) |
| Freshness | changes can take a while to show up | live |

Why not a normal "Sign in with Google"? Google's sign-in for watches and TVs does
not allow calendar access, and the Pebble phone app has no browser for the usual
flow. Both modes avoid that: nothing goes through a server run by the developer.

## Light: secret iCal address (read only)

1. On a computer, open <https://calendar.google.com/>, then the gear → **Settings**.
2. Under **Settings for my calendars** on the left, click the calendar you want.
3. Scroll to **Integrate calendar** and copy **Secret address in iCal format**.
   It ends in `basic.ics`.
4. In AI Companion's settings, set **Connection** to **Light** and paste the
   address. Save.

Keep the address private: anyone who has it can read that calendar. If it leaks,
press **Reset** next to it in Google Calendar and paste the new one.

## Advanced: Apps Script bridge (read and write)

1. Open <https://script.google.com/> and create a **New project**. Replace the
   contents of `Code.gs` with [`gas/Code.gs`](../gas/Code.gs) from this
   repository, and save.
2. Click the gear (**Project Settings**) → **Script Properties** → add a property
   named `SECRET`. Use a **long random string** as its value (for example the
   output of `openssl rand -hex 24`).
3. Back in the editor, choose `authorize` in the function menu and press **Run**.
   Allow calendar access. If Google says "Google hasn't verified this app", click
   **Advanced** → **Go to (project name) (unsafe)**. It's your own script.
   The log should end with `Calendar access OK`.
4. **Deploy** → **New deployment** → type **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**

   Press **Deploy**. (If the consent screen after Deploy fails with "The OAuth
   client was not found", step 3 fixes it.)
5. Copy the **Web app URL** ending in `/exec`. Opening it in a browser should
   show `ok`.
6. In AI Companion's settings, set **Connection** to **Advanced**, paste the URL
   and the `SECRET` value. Save.

What the advanced mode does:

- **Reads** from every calendar ticked in Google Calendar.
- **Adds** to your default calendar: one hour for a timed event, all day when only
  a date is given.
- **Changes and deletes** only events on calendars you own (holiday calendars are
  read only), and only after you confirm on the watch: Up / swipe up to go ahead,
  Down, Back or swipe down to cancel. No answer within 60 seconds counts as cancel.
  For a recurring event, only that occurrence is changed or deleted.

Anyone with both the URL and the secret can read and change your calendar. If the
secret leaks, change the `SECRET` script property and enter the new value in the
settings (no redeploy needed). After updating `Code.gs`, use **Deploy → Manage
deployments → Edit → Version: New version** to keep the same URL.

---

# Google カレンダー連携の設定

AI Companion は Google カレンダーの予定を読んで「明日の予定は?」に答えられます。
つなぎ方は2通りです。アプリの設定画面（Pebble スマホアプリ → AI Companion → 設定）の
**Google カレンダー連携 → 連携方法** で選びます。

| | ライト | 上級者向け |
|---|---|---|
| 予定を読む | ✓ | ✓ |
| 追加・時刻変更・名前変更・削除 | – | ✓（変更と削除は腕時計で確認してから） |
| 対象のカレンダー | アドレスを貼った1つ | Google カレンダーでチェックを入れているもの全部 |
| 準備 | アドレスを1つコピー（2分） | 自分のアカウントに Apps Script を置く（5分） |
| 反映 | 予定の変更が反映されるまで時間がかかることがある | すぐ |

通常の「Google でログイン」を使わないのは、腕時計・テレビ向けの Google ログインが
カレンダーの権限に対応しておらず、Pebble スマホアプリには通常のログイン画面を出す
ブラウザもないためです。どちらの方式も、開発者が運用するサーバーは経由しません。

## ライト: iCal 形式の非公開アドレス（読むだけ）

1. パソコンで <https://calendar.google.com/> を開き、歯車 → **設定**。
2. 左の **マイカレンダーの設定** から、使いたいカレンダーを選ぶ。
3. **カレンダーの統合** までスクロールし、**iCal 形式の非公開アドレス** をコピー
   （末尾が `basic.ics`）。
4. AI Companion の設定で **連携方法** を **ライト** にしてアドレスを貼り、保存。

このアドレスを知っている人はそのカレンダーを読めます。漏れたら Google カレンダーで
アドレスの横の **リセット** を押し、新しいアドレスを貼り直してください。

## 上級者向け: Apps Script 中継（読み書き）

1. <https://script.google.com/> で **新しいプロジェクト** を作り、`Code.gs` の中身を
   このリポジトリの [`gas/Code.gs`](../gas/Code.gs) で置き換えて保存。
2. 歯車（**プロジェクトの設定**）→ **スクリプト プロパティ** で `SECRET` を追加し、
   **長いランダムな文字列** を値にする（例: `openssl rand -hex 24` の出力）。
3. エディタに戻り、関数の選択欄で `authorize` を選んで **実行**。カレンダーへの
   アクセスを許可する。「このアプリは Google で確認されていません」と出たら
   **詳細** →「（プロジェクト名）（安全ではないページ）に移動」。自分のスクリプトなので
   問題ありません。ログに `Calendar access OK` と出れば完了。
4. **デプロイ** → **新しいデプロイ** → 種類 **ウェブアプリ**
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**

   **デプロイ** を押す（デプロイ後の許可画面で「The OAuth client was not found」と
   出る場合は、手順 3 を先にやれば通ります）。
5. `/exec` で終わる **ウェブアプリの URL** をコピー。ブラウザで開いて `ok` と出れば OK。
6. AI Companion の設定で **連携方法** を **上級者向け** にして、URL と `SECRET` の値を入れて保存。

上級者向けでできること:

- **読む**: Google カレンダーでチェックを入れているカレンダーすべてから。
- **追加**: 既定のカレンダーに。時刻指定なら1時間、日付だけなら終日の予定。
- **変更・削除**: 自分が所有するカレンダーの予定だけ（祝日カレンダーなどは読むだけ）。
  必ず腕時計で確認してから実行します（上ボタン・上スワイプで実行、下ボタン・戻る・
  下スワイプでやめる。60 秒答えないと「やめる」扱い）。繰り返しの予定はその回だけ。

URL と合言葉の両方を知っている人はカレンダーを読み書きできます。合言葉が漏れたら
スクリプト プロパティの `SECRET` を変え、設定画面にも新しい値を入れてください
（再デプロイは不要）。`Code.gs` を更新したら **デプロイ → デプロイを管理 → 編集 →
バージョン: 新バージョン** で、URL を変えずに反映できます。
