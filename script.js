const GEMINI_API_KEY = "AIzaSyDzKq9n6SlpMzloQ0IkWbIkqLICHBSXszY";
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent";

const promptText = `Jesteś ekspertem ds. żywienia i analizujesz wizualnie posiłki. Twoim zadaniem jest oszacowanie wartości kalorycznej na podstawie załączonego zdjęcia.

Wykonaj następujące, dokładne kroki analizy:
1.  **Identyfikacja Składników:** Wylistuj wszystkie główne składniki posiłku widoczne na zdjęciu (np. rodzaj mięsa, zboża, warzywa, sosy).
2.  **Oszacowanie Gramatury:** Oszacuj przybliżoną, rozsądną porcję lub gramaturę (w gramach lub mililitrach) każdego zidentyfikowanego składnika.
3.  **Kalkulacja Kaloryczna:** Na podstawie oszacowanej gramatury i standardowych wartości odżywczych, oblicz całkowitą szacowaną kaloryczność (w kilokaloriach, kcal) dla całego posiłku.

**Format Odpowiedzi:**
Sformatuj całą odpowiedź w języku polskim, używając listy do wyszczególnienia składników, a końcowy wynik podaj zawsze na końcu w wyraźnie pogrubionej sekcji.
**Całkowita szacowana kaloryczność posiłku: [Wartość w kcal] kcal.**`;

const fileInput = document.querySelector("#mealImage");
const analyzeButton = document.querySelector("#analyzeButton");
const resultsContainer = document.querySelector("#results");
const calorieValueEl = document.querySelector("#calorieValue");
const analysisDetailsEl = document.querySelector("#analysisDetails");
const placeholderEl = document.querySelector("#analysisPlaceholder");
const previewContainer = document.querySelector("#previewContainer");
const previewImage = document.querySelector("#imagePreview");
const previewFilename = document.querySelector("#previewFilename");

let selectedFile = null;

fileInput?.addEventListener("change", handleFileSelection);
analyzeButton?.addEventListener("click", handleAnalyzeClick);

function handleFileSelection(event) {
  const [file] = event.target.files || [];
  selectedFile = file ?? null;

  if (!file) {
    togglePreview(false);
    analyzeButton.disabled = true;
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  previewImage.src = objectUrl;
  previewImage.onload = () => URL.revokeObjectURL(objectUrl);
  previewFilename.textContent = file.name;
  togglePreview(true);
  analyzeButton.disabled = false;
}

function togglePreview(isVisible) {
  if (!previewContainer) return;
  if (isVisible) {
    previewContainer.removeAttribute("hidden");
  } else {
    previewContainer.setAttribute("hidden", "hidden");
    previewImage.removeAttribute("src");
    previewFilename.textContent = "";
  }
}

async function handleAnalyzeClick() {
  if (!selectedFile) {
    renderMessage(
      "Nie wybrano pliku. Wgraj zdjęcie, aby rozpocząć analizę.",
      true
    );
    return;
  }

  if (!GEMINI_API_KEY || GEMINI_API_KEY === "TWOJ_KLUCZ_API_GEMINI_TUTAJ") {
    renderMessage(
      "Uzupełnij stałą GEMINI_API_KEY własnym kluczem, zanim rozpoczniesz analizę.",
      true
    );
    return;
  }

  analyzeButton.disabled = true;
  renderMessage("Przetwarzanie obrazu i wysyłanie zapytania do Gemini AI…");

  try {
    const base64Image = await toBase64(selectedFile);
    const payload = buildPayload(base64Image);

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const apiMessage = extractErrorMessage(data);
      throw new Error(
        `Błąd API (${response.status}): ${apiMessage || response.statusText || "Brak dodatkowych informacji"}`
      );
    }

    const text = extractTextFromGemini(data);
    const calorieInfo = parseCalories(text);
    renderAnalysis(text, calorieInfo);
  } catch (error) {
    console.error(error);
    renderMessage(
      error.message ||
        "Nie udało się przeprowadzić analizy. Spróbuj ponownie później.",
      true
    );
  } finally {
    analyzeButton.disabled = false;
  }
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        const base64 = result.split(",")[1];
        resolve(base64);
      } else {
        reject(new Error("Nie udało się odczytać pliku."));
      }
    };
    reader.onerror = () => reject(new Error("Błąd odczytu pliku."));
    reader.readAsDataURL(file);
  });
}

function buildPayload(base64Image) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          { text: promptText },
          {
            inlineData: {
              mimeType: selectedFile.type,
              data: base64Image,
            },
          },
        ],
      },
    ],
  };
}

function extractTextFromGemini(data) {
  const candidates = data?.candidates;
  if (!Array.isArray(candidates)) return "";

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }

  return "";
}

function extractErrorMessage(data) {
  if (!data) return "";
  if (typeof data.error?.message === "string") {
    return data.error.message;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  return "";
}

function renderMessage(message, isError = false) {
  if (!analysisDetailsEl || !calorieValueEl) return;

  analysisDetailsEl.innerHTML = "";
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  if (isError) {
    paragraph.classList.add("error");
    calorieValueEl.textContent = "-- kcal";
  }

  analysisDetailsEl.appendChild(paragraph);
}

function renderAnalysis(rawText, calorieInfo) {
  if (!analysisDetailsEl || !calorieValueEl) return;

  analysisDetailsEl.innerHTML = "";

  const formatted = document.createElement("div");
  formatted.className = "analysis-text";
  formatted.innerHTML = rawText
    ? rawText
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n\n/g, "</p><p>")
        .replace(/\n/g, "<br>")
    : "Brak treści odpowiedzi od modelu.";

  // Ensure content wrapped in paragraphs for spacing
  analysisDetailsEl.appendChild(formatAsParagraphs(formatted.innerHTML));

  if (calorieInfo?.value) {
    calorieValueEl.textContent = `${calorieInfo.value} kcal`;
  } else {
    calorieValueEl.textContent = "-- kcal";
  }

  placeholderEl?.remove();
}

function parseCalories(text) {
  if (typeof text !== "string") return null;

  const match = text.match(/Całkowita\s+szacowana\s+kaloryczność\s+posiłku:\s*([0-9]+(?:[,\.][0-9]+)?)\s*kcal/i);
  if (!match) return null;

  const numeric = match[1].replace(/,/g, ".");
  const rounded = Math.round(Number.parseFloat(numeric));
  if (Number.isNaN(rounded)) return null;

  return { value: rounded };
}

function formatAsParagraphs(htmlString) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = htmlString;

  const paragraphs = wrapper.innerHTML
    .split(/\s*<\/p>\s*/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      if (chunk.startsWith("<p")) return chunk;
      return `<p>${chunk}</p>`;
    })
    .join("");

  const container = document.createElement("div");
  container.innerHTML = paragraphs;
  return container;
}
