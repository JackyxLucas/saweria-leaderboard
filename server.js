
const express = require("express");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STREAM_KEY = process.env.SAWERIA_STREAM_KEY;

// Halaman pengecekan server
app.get("/", (req, res) => {
  res.send("Saweria Leaderboard is running!");
});

// Menerima webhook Saweria
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    const {
      version,
      id,
      amount_raw,
      donator_name,
      donator_email
    } = data;

    const signature = req.get("Saweria-Callback-Signature");

    if (!STREAM_KEY || !signature) {
      return res.status(401).send("Unauthorized");
    }

    const message =
      String(version) +
      String(id) +
      String(amount_raw) +
      String(donator_name) +
      String(donator_email || "");

    const expectedSignature = crypto
      .createHmac("sha256", STREAM_KEY)
      .update(message)
      .digest("hex");

    const received = Buffer.from(signature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      return res.status(401).send("Invalid signature");
    }

    if (
      data.type !== "donation" ||
      !id ||
      !donator_name ||
      !Number.isSafeInteger(Number(amount_raw)) ||
      Number(amount_raw) <= 0
    ) {
      return res.status(400).send("Invalid donation data");
    }

    const { error } = await supabase.rpc(
      "add_saweria_donation",
      {
        p_id: String(id),
        p_donor_name: String(donator_name).trim(),
        p_amount: Number(amount_raw)
      }
    );

    if (error) throw error;

    res.status(200).send("Donation recorded");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Server error");
  }
});

// Mengambil Top 5 donatur
app.get("/api/leaderboard", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("donors")
      .select("donor_name,total_amount")
      .order("total_amount", { ascending: false })
      .limit(5);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

// Overlay untuk TikTok LIVE Studio
app.get("/overlay", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          margin: 0;
          background: transparent;
          color: white;
          font-family: Arial, sans-serif;
          overflow: hidden;
        }
        .bar {
          display: flex;
          align-items: center;
          gap: 30px;
          white-space: nowrap;
          padding: 12px;
          background: rgba(0,0,0,0.65);
          border-radius: 12px;
          width: max-content;
          animation: scroll 25s linear infinite;
        }
        .title {
          color: #ffd700;
          font-weight: bold;
        }
        @keyframes scroll {
          from { transform: translateX(100vw); }
          to { transform: translateX(-100%); }
        }
      </style>
    </head>
    <body>
      <div class="bar" id="board">
        <span class="title">🏆 TOP 5 DONATUR ALL TIME</span>
        <span>Memuat leaderboard...</span>
      </div>
      <script>
        async function loadBoard() {
          try {
            const response = await fetch("/api/leaderboard");
            const donors = await response.json();
            const board = document.getElementById("board");

            const title = document.createElement("span");
            title.className = "title";
            title.textContent = "🏆 TOP 5 DONATUR ALL TIME";

            board.replaceChildren(title);

            donors.forEach((donor, index) => {
              const item = document.createElement("span");
              item.textContent =
                (index + 1) + ". " +
                donor.donor_name + " — Rp" +
                Number(donor.total_amount).toLocaleString("id-ID");
              board.appendChild(item);
            });

            if (donors.length === 0) {
              const empty = document.createElement("span");
              empty.textContent = "Belum ada donatur";
              board.appendChild(empty);
            }
          } catch (error) {
            console.error(error);
          }
        }

        loadBoard();
        setInterval(loadBoard, 15000);
      </script>
    </body>
    </html>
  `);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Saweria Leaderboard is running");
});
