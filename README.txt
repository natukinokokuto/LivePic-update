LivePIC Semantic Engine v1

これは既存LivePICのCUT/IRIAM系処理を使わず、ゼロから作った意味付きメッシュマッピング確認用ビューアです。

目的:
- .cmo3群を意味スロットとして実読み込みする
- PNG/JPGを全面表示する
- CUTマスク・円形切り抜き・自動補完を一切使わない
- Face_Base / Eye_L / Eye_R / Mouth / Hair_Front / Hair_Back / Neck / Body_Upper を変形確認する

現時点:
- .cmo3はArrayBufferで読み込み、名前から意味スロットへ登録
- Cubism内部メッシュ解析は未実装
- まずは変形ビューアとして、瞬き・口パク・振り向きの制御確認用

使い方:
1. index.htmlを開く
2. 表示用PNG/JPGを選ぶ
3. .cmo3群をまとめて選ぶ
4. 右側の変形ビューアで各意味レイヤーを動かす
