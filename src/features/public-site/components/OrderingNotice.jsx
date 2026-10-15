const OrderingNotice = ({ copy }) => (
  <section className="ordering-section" id="ordering" aria-labelledby="ordering-title">
    <div className="container ordering-inner">
      <div><p className="eyebrow">{copy.orderEyebrow}</p><h2 className="preserve-lines" id="ordering-title">{copy.orderTitle}</h2></div>
      <div className="ordering-copy">
        <p>{copy.orderBody}</p>
        <div className="platform-grid">
          {["GoFood", "GrabFood"].map((platform) => (
            <div className="platform-card" key={platform}>
              <span>{platform}</span><small>{copy.unavailable}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default OrderingNotice;
