# AI Companion — 開発メモ

Pebble 用 AI コンパニオンアプリ。**対象は emery と gabbro**。

- emery: Pebble Time 2, 200x228, カラー, 角型, マイク・タッチ・スピーカーあり
- gabbro: Pebble Round 2, 260x260, カラー, **丸型**, マイク・タッチあり、**スピーカーなし**

機種差は `PBL_ROUND` / `PBL_TOUCH` / `PBL_SPEAKER` で分岐する。スピーカー API は
gabbro のヘッダにも宣言があるのでビルドは通ってしまう。必ず `PBL_SPEAKER` で囲み、
音は `sound.c` 経由で鳴らすこと。

## コマンド

Pebble SDK は WSL 側にあります。Windows の git-bash からは `pebble` が見えないので、
`wsl bash -lc` 経由で呼びます（`<repo>` は WSL から見たこのリポジトリのパス）。

```bash
wsl bash -lc "cd <repo> && pebble build"
wsl bash -lc "cd <repo> && pebble install --emulator emery"
wsl bash -lc "cd <repo> && pebble screenshot --no-open shot.png"
```

エミュレータが `[Errno 111] Connection refused` を返す・ブートループする場合:

```bash
wsl bash -lc "pebble kill; pebble wipe"
```

`pebble wipe` は persist も消すので、予定・言語設定がリセットされます。

画面遷移は `pebble emu-button --emulator <機種> click up|down|select|back` で操作できる
（pebble-tool 5.0.40 で動作確認。5.0.31 では argparse の問題で落ちた）。

## 構造

- 腕時計側（`src/c/`）が UI と予定の実体を持つ。タイマー/アラーム/リマインダーは
  Wakeup API で鳴るので、スマホが圏外でも動く。
- スマホ側（`src/pkjs/`）が LLM の API を叩き、ツールを実行する。
  PebbleKit JS は ES5 + XMLHttpRequest のみ。**どのプロバイダの SDK も使えない**ので
  REST を直接叩いている。アロー関数・`let`・テンプレートリテラルは使わないこと。
- `enableMultiJS: true` なので `require('./foo')` が使える（webpack でバンドル）。

### プロバイダ層

Anthropic / OpenAI / Gemini の3つ。**同時に有効なのは1つだけ**。

- `providers/catalog.js` — メタデータの唯一の出どころ。**依存を足さないこと**。
  `settings.js` も `config_page.js` も参照するので、何かを require した瞬間に循環する。
- 既定モデルは**各社のミドル級**（Sonnet / Terra / Flash）。回答は2文なので
  フラッグシップにしても見た目が変わらず、待ち時間とコストだけ増える。
  ローリングエイリアスがあるプロバイダはそれを使う（Gemini の `-latest` 系）。
  無いプロバイダは catalog の更新が必要なので、モデル ID を書き換えたら
  `PROVIDER=... MODEL=... node livetest.js` で実際に通ることを確認すること。
- `providers/<id>.js` — そのプロバイダのリクエスト形状・ツールループ・会話状態。
  `module.exports` は `{id, ask, resetSession}` だけ。メタデータは catalog 側。
- 会話の持ち方が3者で違う（Anthropic: messages 配列 / OpenAI: input 配列 /
  Gemini: `previous_interaction_id`）。だから履歴は index.js ではなく各モジュールが持つ。
- 思考の深さも3者でフィールド名が違う。`output_config.effort` /
  `reasoning.effort` / `generation_config.thinking_level`。設定は `low`/`medium`/`high`
  の3段階だが、これは**3社の共通部分だから**。Gemini は `minimal` まで、Anthropic は
  `xhigh`/`max` まであるので、増やすときは3社全部で通ることを確認すること。
- ツール定義は `tools.js` に1本。Anthropic は `input_schema`、OpenAI と Gemini は
  フラットな `parameters` なので `tools.flatDefinitions()` で変換する。
- 設定キーはプロバイダごとに接尾辞つき（`api_key_openai` など）。
  `settings.apiKey()` / `.model()` / `.baseUrl()` が有効なプロバイダの値を解決する。
- `settings.save()` は **catalog の既定値と一致する値を保存しない**。設定画面は既定値を
  入力欄に表示するので、素直に保存すると今日の既定値が固定化されて catalog の更新が
  届かなくなる。上書きした値だけを storage に残すこと。

### 設定画面（ハマりどころ）

**既定値を入力欄に埋めないこと。** モデルとエンドポイントは「上書き」であって
「値」ではない。空欄＝既定値、既定値は placeholder に出すだけ。欄に埋めると保存時に
ユーザー入力として storage に焼き付き、プロバイダを変えても追従しなくなる。
実際にこれで Gemini がずっと Anthropic のエンドポイントを叩いていた。

**保存時はプロバイダをキャッシュ変数ではなく DOM から読むこと。** モバイルの
webview は `<select>` の `change` を blur まで遅らせることがあり、ピッカーから
直接「保存」を押すと発火が間に合わない。キャッシュした id を使うと、選んだのとは
別のプロバイダに値が書き込まれる。`change` / `input` / `blur` の3つを購読しつつ、
保存時は必ず `el("provider").value` を読む。ここでは `load()` を呼ばないこと
（入力したばかりの値を捨ててしまう）。

`settings.repair()` が起動時に、他プロバイダの既定値と一致する保存値を掃除する。
既存インストールの自己修復用なので消さないこと。

### 認証まわり（ハマりどころ）

- ヘッダ値は `http.js` の `headerSafe()` を必ず通す。**改行が1つ入るだけで
  エンジンがヘッダごと落とし**、サーバーからは「キーが送られていない」と見える。
  スマホのキーボードからのペーストで実際に起きる。
- `settings` は保存時と読み出し時の両方でトリムする。読み出し側も要るのは、
  古いビルドが保存した汚れた値を後から掃除するため。
- プロバイダのエラーには `provider.js` でラベルを付けている。**消さないこと。**
  認証エラーの原因はたいてい「意図と違うプロバイダで動いていた」なので、
  時計の画面にプロバイダ名が出ることが最短の診断になる。
- `provider.ask()` は毎回 provider / model / endpoint / キー長を `console.log`
  する。`pebble logs` で拾える唯一の手がかりなので残しておくこと。

### 予定の写し（ハマりどころ）

スマホ側は腕時計の予定の写し（`state.schedule`）を持っていて、`list_schedule`
ツールがそれを読む。写しは2方向から更新する。**どちらか片方だと壊れる。**

- 腕時計: `comm.c` の `prv_apply_action()` が変更後に `comm_sync_schedule()` を呼ぶ
- スマホ: `index.js` の `sendAction()` が `state.schedule` をその場で更新する

さらに、プロバイダは ctx オブジェクトの参照をツールループ全体で持ち続ける。
`state.schedule` を差し替えるだけでは ctx 側が古いままなので、`state.activeCtx`
経由でそちらにも書くこと。「タイマーをセットして、あと何分か教えて」という
1ターンの中の読み直しで実際に壊れた（`devtest.js` の schedule mirror ケース）。

### Google カレンダー（ハマりどころ）

- 接続は `gas/Code.gs`（ユーザーが自分のアカウントにデプロイする Apps Script）経由。
  Google のデバイス OAuth はカレンダーのスコープに対応していないので、この形になっている。
- 時刻は**エポックミリ秒**でやり取りする。スマホとスクリプトでタイムゾーンが違っても
  ずれないように。終日の予定だけは `yyyy-MM-dd` の文字列で、カレンダー側のタイムゾーンで解釈する。
- AI には中継の ref（カレンダーID|イベントID|開始時刻）を見せず、`calendar.js` が
  `e3` のような短い ID に置き換える。**一覧を取らずに変更・削除させないため**なので、
  ref をそのまま渡すように変えないこと。繰り返しの予定はイベント ID が共通なので、
  ref には開始時刻が要る。
- 変更・削除は `ctx.confirm()` で腕時計に確認を出してから実行する。返事が来ない・
  画面が閉じられた・60 秒経過はすべて「いいえ」。リクエストが中断されたら
  `dropConfirm()` で待ちを捨てる（遅れて届いた返事でツールループを再開させない）。
- カレンダーのツールは中継が設定されているときだけ AI に渡す（`tools.definitions()`）。
  プロバイダは `tools.DEFINITIONS` を直接使わず、必ず `definitions()` / `flatDefinitions()` を通すこと。

## 変更時の注意

- `package.json` の `messageKeys` を増やしたら、`src/c/comm.h` の enum と
  `src/pkjs/index.js` の `CMD` / `ST` / `tools.js` の `ACT` を必ず合わせる。
  片方だけ変えても**ビルドは通る**ので気づけない。
- 文字列を足すときは `i18n.h` の `StrId` と `i18n.c` の `s_ja` / `s_en` の両方に。
  片方が欠けると `S()` が空文字を返すだけでビルドは通る。
- ビルドは `-Werror` 付き。`snprintf` の切り詰め警告もエラーになるので、
  バッファは `SCHED_LABEL_LEN` 基準で取ること。
- 回答は腕時計側 `ANSWER_MAX`（1024 バイト）に収める。`index.js` の
  `ANSWER_BYTE_BUDGET` と揃っていないと末尾が落ちる。
- Wakeup は 1 アプリ 8 件・1 分以上の間隔という firmware 制約がある。
  `store_reschedule_wakeups()` がこれを吸収している。

## 動作確認

- `gas/Code.gs` はこの環境では動かせない。変更したら実際に Apps Script にデプロイして
  ブラウザで `/exec` を開き、`ok` が返ることと、腕時計から一覧・追加ができることを確かめる。
- **スマホ側を触ったら `node devtest.js`。** 実 API を叩かずに3プロバイダの
  ツールループを流す。リクエスト形状・ツール往復・回答送信を検証している。
  プロバイダを足したらここにもケースを足すこと。
- 実 API で確かめたいときは `PROVIDER=gemini API_KEY=... node livetest.js`。
  引数で質問を並べられる。`--verbose` で生の HTTP が出る。**課金が発生する。**
  キーは環境変数から渡すこと。コードにもコミットにも残さない。
- ビルドが通っただけでは足りない。`pebble install --emulator emery` と `--emulator gabbro` の
  両方に入れて、`pebble screenshot` で実画面を見ること。
- 日本語は言語パックのないエミュレータでは豆腐になる。レイアウト確認は
  `src/pkjs/settings.js` の `lang` 既定値を一時的に `'en'` にして行う
  （腕時計側の既定ではなく**スマホ側の設定が優先**される）。
