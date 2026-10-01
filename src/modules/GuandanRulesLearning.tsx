/**
 * 掼蛋规则学习
 * 经典掼蛋规则（两副牌四人两两组队，从2打起逐级升级，过A获胜）
 */
export function GuandanRulesLearning() {
  return (
    <div className="gd-rules module">
      <div className="module-header">
        <h2>🃏 掼蛋 · 规则学习</h2>
        <p>经典掼蛋玩法，四人两两组队，从 2 打起一路升级到 A 获胜！</p>
      </div>

      <div className="gd-rules-grid">
        <section className="gd-rules-card">
          <h3>🎯 游戏目标</h3>
          <p>四人参与，坐在对面的两人组成一队。共两副牌 108 张，每人 27 张。按出完牌的先后顺序产生头游、二游、三游、末游。率先出完的一方获得"头游"，全队按成绩升级，从 2 开始一直打到 A，打过 A 的一方获胜。</p>
        </section>

        <section className="gd-rules-card">
          <h3>⚖️ 牌的大小</h3>
          <p>大小：大王 &gt; 小王 &gt; <b>级牌</b> &gt; A &gt; K &gt; Q &gt; J &gt; 10 &gt; … &gt; 3 &gt; 2。</p>
          <p>打几，几就是<b>级牌</b>——比如打 2 时，所有 2 都比 A 大（但小于王）。级牌是全场最大的普通牌。</p>
        </section>

        <section className="gd-rules-card">
          <h3>🃏 牌型一览</h3>
          <ul className="gd-type-list">
            <li><b>单张 / 对子 / 三张</b>——最基础牌型</li>
            <li><b>三带二</b>——三张同点数 + 两张任意</li>
            <li><b>顺子</b>——5 张或以上连续点数（如 3-4-5-6-7）</li>
            <li><b>连对</b>——3 对或以上连续对子</li>
            <li><b>钢板</b>——2 组或以上连续三张</li>
            <li><b>炸弹</b>——4 张或以上同点数（四炸、五炸…）</li>
            <li><b>同花顺</b>——同花色 5 张连续，比炸弹大</li>
            <li><b>天王炸</b>——四张王，最大的牌型</li>
          </ul>
        </section>

        <section className="gd-rules-card">
          <h3>🚀 升级规则</h3>
          <p>头游 + 队友二游（双下）：全队<b>升 3 级</b>；头游 + 三游：<b>升 2 级</b>；头游 + 末游：<b>升 1 级</b>。</p>
          <p>打 A 时必须头游 + 队友二游（双上）才算过 A 获胜；否则留在 A 继续打。</p>
        </section>

        <section className="gd-rules-card">
          <h3>📮 进贡与还贡</h3>
          <p>双下时（头游队包揽前两名），末游须向头游进贡一张手中最大的非王牌；头游还贡一张 10 以下（不含 10）的牌。进贡后由还贡方（头游队）先出牌。</p>
        </section>

        <section className="gd-rules-card">
          <h3>💡 小技巧</h3>
          <ul className="gd-type-list">
            <li>炸弹和同花顺是关键胜负手，尽量留在关键轮次</li>
            <li>级牌是最大单牌，配合顺子/连对威力巨大</li>
            <li>队友之间要互相配合：队友出大牌时可以选择不出</li>
            <li>记牌：关注还剩几张级牌、几张王</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

export default GuandanRulesLearning;
