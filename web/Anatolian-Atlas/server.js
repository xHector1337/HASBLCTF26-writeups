const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;
const FLAG = process.env.FLAG || "HASBL{7urkish_F00ds_4r3_D3lici0us}";

const restaurants = [
  { id: "istanbul", city: "Istanbul", name: "Istanbul", left: 17, top: 21 },
  { id: "ankara", city: "Ankara", name: "Ankara", left: 38, top: 40 },
  { id: "izmir", city: "Izmir", name: "Izmir", left: 9, top: 56 },
  { id: "bursa", city: "Bursa", name: "Bursa", left: 20, top: 36 },
  { id: "antalya", city: "Antalya", name: "Antalya", left: 31, top: 78 },
  { id: "adana", city: "Adana", name: "Adana", left: 52, top: 70 },
  { id: "gaziantep", city: "Gaziantep", name: "Gaziantep", left: 62, top: 76 },
  { id: "konya", city: "Konya", name: "Konya", left: 37, top: 59 },
  { id: "kayseri", city: "Kayseri", name: "Kayseri", left: 54, top: 56 },
  { id: "trabzon", city: "Trabzon", name: "Trabzon", left: 73, top: 28 },
  { id: "samsun", city: "Samsun", name: "Samsun", left: 53, top: 25 },
  { id: "diyarbakir", city: "Diyarbakir", name: "Diyarbakir", left: 74, top: 62 },
  { id: "mardin", city: "Mardin", name: "Mardin", left: 76, top: 71 },
  { id: "erzurum", city: "Erzurum", name: "Erzurum", left: 80, top: 38 },
  { id: "van", city: "Van", name: "Van", left: 92, top: 54 },
  { id: "eskisehir", city: "Eskisehir", name: "Eskisehir", left: 29, top: 42 },
  { id: "corum", city: "Corum", name: "Corum", left: 48, top: 34 },
  { id: "balikesir", city: "Balikesir", name: "Balikesir", left: 14, top: 40 }
];

const reviewsByRestaurant = new Map();
const users = new Map();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "ctf-session-secret",
    resave: false,
    saveUninitialized: false
  })
);
app.use(express.static(path.join(__dirname, "public")));

function getRestaurant(id) {
  return restaurants.find((item) => item.id === id);
}

function normalizeComment(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\u0307/g, "")
    .replace(/\s+/g, " ");
}

app.get("/", (req, res) => {
  const selectedCity = typeof req.query.city === "string" ? req.query.city : "";
  const reviewError = req.session.reviewError || null;
  req.session.reviewError = null;
  res.render("index", {
    restaurants,
    user: req.session.user || null,
    selectedCity,
    reviewError
  });
});

app.get("/login", (req, res) => {
  res.render("login", {
    user: req.session.user || null,
    next: req.query.next || "/"
  });
});

app.get("/register", (req, res) => {
  res.render("register", {
    user: req.session.user || null,
    next: req.query.next || "/"
  });
});

app.post("/login", (req, res) => {
  const username = (req.body.username || "").trim();
  const password = (req.body.password || "").trim();
  if (!username || !password) {
    return res.status(400).render("login", {
      user: null,
      next: req.body.next || "/",
      error: "Please enter a username and password."
    });
  }
  const storedPassword = users.get(username);
  if (!storedPassword || storedPassword !== password) {
    return res.status(401).render("login", {
      user: null,
      next: req.body.next || "/",
      error: "Invalid username or password."
    });
  }
  req.session.user = { name: username };
  res.redirect(req.body.next || "/");
});

app.post("/register", (req, res) => {
  const username = (req.body.username || "").trim();
  const password = (req.body.password || "").trim();
  if (!username || password.length < 6) {
    return res.status(400).render("register", {
      user: null,
      next: req.body.next || "/",
      error: "Please enter a username and a password with at least 6 characters."
    });
  }
  if (users.has(username)) {
    return res.status(409).render("register", {
      user: null,
      next: req.body.next || "/",
      error: "That username is already taken."
    });
  }
  users.set(username, password);
  const nextTarget = encodeURIComponent(req.body.next || "/");
  res.redirect(`/login?next=${nextTarget}`);
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

app.get("/restaurant/:id", (req, res) => {
  const restaurant = getRestaurant(req.params.id);
  if (!restaurant) {
    return res.status(404).send("Not found");
  }
  const reviews = reviewsByRestaurant.get(restaurant.id) || [];
  res.render("restaurant", {
    restaurant,
    reviews,
    user: req.session.user || null,
    flag: req.session.flag || null
  });
});

app.get("/api/restaurant/:id", (req, res) => {
  const restaurant = getRestaurant(req.params.id);
  if (!restaurant) {
    return res.status(404).json({ error: "Not found" });
  }
  const reviews = reviewsByRestaurant.get(restaurant.id) || [];
  res.json({
    restaurant,
    reviews,
    flag: req.session.flag || null,
    loggedIn: Boolean(req.session.user)
  });
});

app.post("/review/:id", (req, res) => {
  const restaurant = getRestaurant(req.params.id);
  if (!restaurant) {
    return res.status(404).send("Not found");
  }
  if (!req.session.user) {
    return res.status(401).render("login", {
      user: null,
      next: `/?city=${restaurant.id}`,
      error: "Login required to submit a review."
    });
  }

  const service = Number(req.body.service);
  const food = Number(req.body.food);
  const hygiene = Number(req.body.hygiene);
  const comment = (req.body.comment || "").trim();

  const scoresValid = [service, food, hygiene].every(
    (score) => Number.isInteger(score) && score >= 1 && score <= 5
  );

  if (!scoresValid || !comment) {
    req.session.reviewError = "Please provide all scores and a comment.";
    return res.redirect(`/?city=${restaurant.id}`);
  }

  const reviews = reviewsByRestaurant.get(restaurant.id) || [];
  reviews.unshift({
    user: req.session.user.name,
    service,
    food,
    hygiene,
    comment,
    createdAt: new Date().toISOString()
  });
  reviewsByRestaurant.set(restaurant.id, reviews);

  const matchesFlag =
    restaurant.id === "kayseri" &&
    service === 3 &&
    food === 5 &&
    hygiene === 4 &&
    normalizeComment(comment) === normalizeComment("Give me the flag!");

  if (matchesFlag) {
    req.session.flag = FLAG;
  }

  res.redirect(`/?city=${restaurant.id}`);
});

app.get("/files", (req, res) => {
  const requested = req.query.path || "";
  const baseDir = path.join(__dirname, "public", "docs");
  const targetPath = path.resolve(baseDir, requested);
  const allowedFlagPath = path.resolve(__dirname, "flag_info.txt");
  const isInsideDocs = targetPath.startsWith(baseDir + path.sep);
  const isFlagInfo = targetPath === allowedFlagPath;

  if (!isInsideDocs && !isFlagInfo) {
    return res.status(404).send("Not found");
  }

  res.sendFile(targetPath, (err) => {
    if (err) {
      res.status(404).send("Not found");
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
