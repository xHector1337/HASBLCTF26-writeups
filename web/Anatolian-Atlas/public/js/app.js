const pinLayer = document.querySelector(".pin-layer");
const panel = document.getElementById("detailPanel");
const panelContent = document.getElementById("panelContent");
const panelName = document.getElementById("panelName");
const panelFlag = document.getElementById("panelFlag");
const panelError = document.getElementById("panelError");
const panelBack = document.getElementById("panelBack");
const reviewForm = document.getElementById("reviewForm");
const reviewList = document.getElementById("reviewList");
const mapLayout = document.querySelector(".map-layout");

if (pinLayer && panel) {
  const loggedIn = panel.dataset.loggedIn === "true";
  const initialCity = panel.dataset.selected;
  let pendingError = panel.dataset.error;

  const renderReviews = (reviews) => {
    if (!reviews.length) {
      reviewList.innerHTML = "<p class=\"muted\">No reviews yet. Be the first to share a score.</p>";
      return;
    }
    reviewList.innerHTML = reviews
      .map(
        (review) =>
          `<article class="review">
            <header>
              <strong>${review.user}</strong>
              <span class="muted">${new Date(review.createdAt).toLocaleString("en-US")}</span>
            </header>
            <p class="score">Service ${review.service} · Food ${review.food} · Hygiene ${review.hygiene}</p>
            <p>${review.comment}</p>
          </article>`
      )
      .join("");
  };

  const renderPanel = (payload) => {
    panel.classList.remove("is-hidden");
    if (mapLayout) {
      mapLayout.classList.remove("panel-closed");
      mapLayout.classList.add("panel-open");
    }
    panelContent.hidden = false;
    panelName.textContent = payload.restaurant.city;

    if (payload.flag) {
      panelFlag.hidden = false;
      panelFlag.querySelector("span").textContent = payload.flag;
    } else {
      panelFlag.hidden = true;
    }

    if (pendingError) {
      panelError.hidden = false;
      panelError.textContent = pendingError;
      pendingError = "";
    } else {
      panelError.hidden = true;
    }

    if (payload.loggedIn) {
      reviewForm.hidden = false;
      reviewForm.action = `/review/${payload.restaurant.id}`;
    } else {
      reviewForm.hidden = true;
    }

    renderReviews(payload.reviews);
  };

  const setActivePin = (id) => {
    pinLayer.querySelectorAll(".pin").forEach((pin) => {
      pin.classList.toggle("pin-active", pin.dataset.id === id);
    });
  };

  const closePanel = () => {
    panel.classList.add("is-hidden");
    panelContent.hidden = true;
    if (mapLayout) {
      mapLayout.classList.remove("panel-open");
      mapLayout.classList.add("panel-closed");
    }
    setActivePin(null);
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", "/");
    }
  };

  const loadRestaurant = (id) => {
    if (!id) {
      return;
    }
    fetch(`/api/restaurant/${id}`)
      .then((response) => response.json())
      .then((payload) => {
        if (payload.error) {
          return;
        }
        renderPanel(payload);
        setActivePin(id);
        if (loggedIn) {
          panelError.hidden = true;
        }
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", `/?city=${id}`);
        }
      })
      .catch(() => {});
  };

  pinLayer.addEventListener("click", (event) => {
    const target = event.target.closest(".pin");
    if (!target) {
      return;
    }
    loadRestaurant(target.dataset.id);
  });

  if (panelBack) {
    panelBack.addEventListener("click", closePanel);
  }

  if (initialCity) {
    loadRestaurant(initialCity);
  }
}
