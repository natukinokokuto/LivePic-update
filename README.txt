LivePIC Semantic Engine v6

目的:
- CUT系処理なし
- 表示用PNG/JPGと.cmo3群を読み込み
- .cmo3のArrayBufferからメッシュ候補点群を抽出
- 画面上に意味領域ガイド＋メッシュ線を表示

注意:
.cmo3はCubism Editorの保存形式で、公式にWeb向けメッシュ展開仕様が公開されている形式ではありません。
このv6ではバイナリ内のfloat値からArtMesh候補を抽出して可視化します。
まず「メッシュ情報が読めているか」を確認するための解析ビューアです。
