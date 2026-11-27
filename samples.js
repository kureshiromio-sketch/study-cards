// 示例题库（第一次打开时自动加入，可以随意删除）
export const SAMPLE_DECKS = [
  {
    id: "sample-n1", name: "JLPT N1 言語知識（示例）", subject: "日语 JLPT N1 言語知識（文字・語彙・文法）",
    cards: [
      { type: "choice", q: "＿＿の言葉の読み方として最もよいものを選びなさい。\n\n新しい制度の導入に伴い、手続きが＿煩雑＿になった。", options: ["はんざつ", "はんさつ", "ぼんざつ", "ふんざつ"], answer: 0 },
      { type: "choice", q: "＿＿の言葉の読み方として最もよいものを選びなさい。\n\n彼は失敗しても決して＿怯ま＿なかった。", options: ["ひるま", "おびま", "ちぢま", "くじけま"], answer: 0 },
      { type: "choice", q: "（　）に入れるのに最もよいものを選びなさい。\n\n長年の努力が（　）、ついに念願の店を開くことができた。", options: ["実って", "稔して", "果たして", "叶えて"], answer: 0 },
      { type: "choice", q: "＿＿の言葉に意味が最も近いものを選びなさい。\n\n会議は＿おおむね＿予定通りに進んだ。", options: ["ほぼ", "かろうじて", "ことごとく", "あくまで"], answer: 0 },
      { type: "choice", q: "次の文の（　）に入れるのに最もよいものを選びなさい。\n\n彼の態度は、反省している（　）、むしろ開き直っているように見えた。", options: ["どころか", "ばかりか", "にもまして", "とあって"], answer: 0 },
      { type: "choice", q: "次の言葉の使い方として最もよいものを選びなさい。\n\n【おろそか】", options: ["忙しさのあまり、家族との時間がおろそかになっていた。", "このおろそかな部屋では落ち着いて勉強できない。", "彼はおろそかな性格で、誰からも好かれている。", "雨がおろそかに降り続いている。"], answer: 0 }
    ]
  },
  {
    id: "sample-en", name: "英语单词（示例）", subject: "英语词汇",
    cards: [
      { type: "flash", q: "meticulous", a: "/məˈtɪkjələs/ adj. 一丝不苟的，极其仔细的" },
      { type: "flash", q: "ubiquitous", a: "/juːˈbɪkwɪtəs/ adj. 无处不在的" },
      { type: "flash", q: "mitigate", a: "/ˈmɪtɪɡeɪt/ v. 减轻，缓和" },
      { type: "flash", q: "inadvertently", a: "/ˌɪnədˈvɜːrtəntli/ adv. 无意中，不经意地" },
      { type: "flash", q: "resilient", a: "/rɪˈzɪliənt/ adj. 有韧性的，能迅速恢复的" },
      { type: "flash", q: "scrutinize", a: "/ˈskruːtənaɪz/ v. 仔细审查" }
    ]
  },
  {
    id: "sample-ko", name: "韩语单词（示例）", subject: "韩语词汇",
    cards: [
      { type: "flash", q: "설레다", a: "[설레다] 动 心动，激动，（因期待而）心跳" },
      { type: "flash", q: "아쉽다", a: "[아쉽따] 形 可惜，遗憾，舍不得" },
      { type: "flash", q: "익숙하다", a: "[익쑤카다] 形 熟悉，习惯" },
      { type: "flash", q: "꾸준히", a: "[꾸준히] 副 坚持不懈地，持续地" },
      { type: "flash", q: "어색하다", a: "[어새카다] 形 尴尬，不自然" },
      { type: "flash", q: "든든하다", a: "[든든하다] 形 踏实，结实，（吃得）饱饱的" }
    ]
  },
  {
    id: "sample-mediacom", name: "Mediacom 入試", subject: "Mediacom 入学考试",
    cards: []
  }
];
