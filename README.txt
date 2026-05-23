# LivePic Working Alpha v0.2

1枚絵を読み込んで、まばたき・口パク・ゆらぎを付ける試作アプリです。

## 使い方

1. `index.html` をブラウザで開く
2. 画像を読み込む
3. 必要なら「顔中心」「左目」「右目」「口」「首」「体中心」をクリック配置
4. 「マイク口パク ON」を押す
5. OBS表示を押す

## GitHub Pages

このZIPの中身をリポジトリ直下に置けばOKです。

```
index.html
style.css
app.js
README.txt
```

GitHub Pagesで公開後、OBSブラウザソースには以下のように `?obs=1` を付けるとOBS専用表示になります。

```
https://ユーザー名.github.io/LivePic-update/?obs=1
```

## 今回入れたもの

- LivePic名に変更
- 画像読み込み
- 自動ポイント配置
- ポイント手動指定
- 自動まばたき
- マイク音量による口パク
- 呼吸/ゆらぎ/傾き
- OBS表示モード
- `?obs=1` のOBS専用表示
- ブラウザ保存/復元
- JSON書き出し/読込

## 注意

マイク機能はブラウザの仕様上、GitHub PagesなどのHTTPS環境か、localhostで動かすのが安定です。
ローカルの `file://` でも表示は動きますが、環境によってマイク許可が出ない場合があります。
