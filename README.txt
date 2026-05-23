# LivePic v3.2 Auto Parts Generator

## 今回の目的

「パーツ分けの画像が自動でできるのが理想」
「それをアプリ内で自動でやってほしい」

に対応した版です。

## 追加機能

- 自動パーツ分け生成
- パーツPNG保存
- 生成パーツでリグ適用
- パーツ確認プレビュー
- 生成されるパーツ
  - original
  - base_inpainted
  - face
  - front_hair
  - back_hair
  - left_eye
  - right_eye
  - mouth
  - neck
  - body
  - combined_preview

## 使い方

1. 画像を読み込む
2. 顔認識 or 固定プリセット
3. 自動マスク作成
4. 自動パーツ分け生成
5. パーツ確認
6. 生成パーツでリグ適用
7. パーツPNG保存

## 注意

これは完全なLive2D用パーツ分けではなく、アプリ内ローカル処理の自動分割です。
綺麗にするには次に「ブラシでマスク修正」が必要です。
