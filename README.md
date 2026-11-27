# 刷题卡片

手机上用的刷题 / 背单词 App（PWA）。

- 自建 session，一次一题，选择题和单词卡两种
- 「查看解析」调用 Claude 生成讲解（API Key 只保存在本机）
- 答错自动进错题本，按间隔重复再出现，连续答对 2 次移出
- Supabase 云同步，多设备共享题库和进度
- 支持 JSON / CSV / 表格粘贴批量导入

纯静态文件，用 GitHub Pages 发布。云同步数据库的建表语句在 `supabase-setup.sql`。
`vendor/` 里是打包好的 `@anthropic-ai/sdk@1.8.0` 和 `@supabase/supabase-js@2.119.0`。
