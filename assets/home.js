// The home page's two small behaviours: the phone menu and the pro form.
// Everything else is plain HTML, readable without JavaScript.
(function () {
  // ---- phone menu -----------------------------------------------------------
  var burger = document.querySelector(".fm-burger");
  var menu = document.getElementById("fm-menu");

  function setMenu(open) {
    menu.hidden = !open;
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    var bars = burger.querySelectorAll("span");
    bars[0].style.transform = open ? "translateY(7.5px) rotate(45deg)" : "";
    bars[1].style.opacity = open ? "0" : "";
    bars[2].style.transform = open ? "translateY(-7.5px) rotate(-45deg)" : "";
  }

  burger.addEventListener("click", function () {
    setMenu(menu.hidden);
  });
  menu.addEventListener("click", function (e) {
    if (e.target.closest("a")) setMenu(false);
  });

  // ---- pro form -------------------------------------------------------------
  var FORM_URL =
    "https://script.google.com/macros/s/AKfycbzKZaZtH5FPbTI2bImTeti2GnVFkNI0tKO1lSIs4s0fN0zSUT1AoUbq_0lxpVtI3sov/exec";
  var lang = document.documentElement.lang;
  var messages =
    lang === "fr"
      ? { name: "Merci d’indiquer le nom de ton activité.", email: "Merci d’entrer un email valide." }
      : { name: "Please enter your business name.", email: "Please enter a valid email address." };

  var nameField = document.getElementById("pro-business");
  var emailField = document.getElementById("pro-email");
  var errorBox = document.getElementById("pro-error");

  function emailIsValid(email) {
    var at = email.indexOf("@");
    var dot = email.lastIndexOf(".");
    return at > 0 && dot > at + 1 && dot < email.length - 1 && email.indexOf(" ") === -1;
  }

  document.getElementById("pro-submit").addEventListener("click", function () {
    var name = nameField.value.trim();
    var email = emailField.value.trim();
    nameField.style.borderColor = "#d9dedc";
    emailField.style.borderColor = "#d9dedc";

    if (!name || !emailIsValid(email)) {
      var bad = name ? emailField : nameField;
      bad.style.borderColor = "#c0392b";
      errorBox.textContent = name ? messages.email : messages.name;
      errorBox.style.display = "block";
      bad.focus();
      return;
    }

    errorBox.style.display = "none";
    fetch(FORM_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        business: name,
        category: document.getElementById("pro-category").value,
        email: email,
        lang: lang,
      }),
    }).catch(function () {});
    document.getElementById("pro-form").hidden = true;
    document.getElementById("pro-done").hidden = false;
  });
})();
