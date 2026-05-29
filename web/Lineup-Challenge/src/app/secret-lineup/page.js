export default function SecretLineup() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "monospace",
      color: "#00ff41",
    }}>
      <span style={{ display: "none" }}>HINT #4: The Central Attacking Midfielder is German and plays in the Premier League. He is 23 years old.</span>
      <div style={{
        border: "1px solid #00ff41",
        padding: "2rem 3rem",
        maxWidth: "480px",
        textAlign: "center",
      }}>
        <p style={{ fontSize: "0.7rem", opacity: 0.4, marginBottom: "1rem" }}>YOU FOUND A SECRET PAGE</p>
        <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>Nothing to see here.</p>
        <p style={{ fontSize: "0.8rem", opacity: 0.5 }}>Or is there? Check the source.</p>
        <a href="/" style={{ display: "block", marginTop: "2rem", color: "#00ff41", opacity: 0.6, fontSize: "0.75rem" }}>← Go back</a>
      </div>
    </div>
  );
}