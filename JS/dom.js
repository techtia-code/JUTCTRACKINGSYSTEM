const ICON_PATHS = {
  "plus": ["M12 5v14m-7-7h14"],
  "pencil": ["m16 4 4 4", "M4 20l4.5-1 11-11a2.1 2.1 0 0 0-4-4l-11 11L4 20Z"],
  "trash": ["M3 6h18", "M8 6V4h8v2", "m19 6-1 14H6L5 6", "M10 11v5m4-5v5"]
};

export function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function makeIcon(name) {
  const namespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(namespace, "svg");
  icon.classList.add("icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "1.8");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  ICON_PATHS[name].forEach(data => {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", data);
    icon.append(path);
  });
  return icon;
}

export function setHeading(heading, iconName, label) {
  heading.replaceChildren(makeIcon(iconName), document.createTextNode(label));
}

export function setMessage(element, text, isError) {
  element.textContent = text;
  element.classList.toggle("error", Boolean(isError));
}
