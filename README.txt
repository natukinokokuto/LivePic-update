# LivePic v3.7 Cut/Rig/Live projectState

## 今回の再構成

LivePicの中に LivePicCut 的な流れを別タブとして組み込みました。

## タブ

### Cut
- 画像読み込み
- 基準点設定
- 輪郭トレース
- 自動パーツ生成
- パーツ確認
- Liveへ即反映

### Rig
- ボーン設定
- 口/目の動き
- 表情
- テスト動作

### Live
- Cut/Rigの結果を即プレビュー

### Export
- パーツPNG保存
- project JSON保存

## 重要

今回から projectState を中心にしました。

- projectState.original
- projectState.points
- projectState.parts
- projectState.masks
- projectState.contours
- projectState.rig

Cutで編集した内容はLiveに即反映されます。
