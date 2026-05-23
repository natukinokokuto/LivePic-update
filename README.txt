LivePic v50 transparent PNG base rebuild

確認済み:
- sample_character.png を透過PNG版に差し替え
- PNG alpha channel: 0〜255 を確認
- alpha=0 の透明領域を背景として扱う前提
- app.js 構文チェックOK
- ZIP展開テストOK

注意:
- これは v49 のコードをベースに、正式サンプルを透過PNG基準へ戻した版。
- 次の確認ポイントは、アプリ上で透明部分にメッシュが出ないか。
