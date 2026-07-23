export interface ExampleMedia {
  src: string;
  alt: string;
  width: number;
  height: number;
  credit: string;
  sourceUrl: string;
}

export const exampleMedia: Record<string, ExampleMedia> = {
  product: {
    src: "/examples/product-perfume.jpg",
    alt: "Clear perfume bottle lit in cool blue on dark folded fabric",
    width: 1400,
    height: 933,
    credit: "Suhas Hanjar",
    sourceUrl: "https://unsplash.com/photos/a-clear-glass-perfume-bottle-on-a-dark-cloth-coi2fv2YUAc",
  },
  travel: {
    src: "/examples/rainy-train.jpg",
    alt: "Train platform glowing under bright lights on a rainy night",
    width: 1400,
    height: 1050,
    credit: "Ritam Baishya",
    sourceUrl: "https://unsplash.com/photos/nighttime-train-station-illuminated-by-bright-lights-L6zNMrQl77g",
  },
  interior: {
    src: "/examples/warm-workspace.jpg",
    alt: "Calm modern home office with a desk, computer, and warm natural details",
    width: 1400,
    height: 1867,
    credit: "Matúš Gocman",
    sourceUrl: "https://unsplash.com/photos/a-modern-home-office-desk-setup-with-a-computer-and-chair-PEUVPUrP744",
  },
  poster: {
    src: "/examples/type-poster.jpg",
    alt: "High-contrast black-and-white typographic poster printed on textured paper",
    width: 1400,
    height: 1752,
    credit: "Ingo Zöll",
    sourceUrl: "https://unsplash.com/photos/text-overlay-on-abstract-grayscale-figure-ZYcOy3_I1bA",
  },
  food: {
    src: "/examples/summer-plate.jpg",
    alt: "Heirloom tomatoes, mozzarella, and basil arranged on a plate",
    width: 1400,
    height: 933,
    credit: "Markus Winkler",
    sourceUrl: "https://unsplash.com/photos/heirloom-tomatoes-mozzarella-and-basil-on-a-plate-WCyxtVptGJM",
  },
  fashion: {
    src: "/examples/fashion-tailoring.jpg",
    alt: "Fashion portrait of a man in a white suit against architectural brickwork",
    width: 1400,
    height: 2100,
    credit: "Emmanuel Akinte",
    sourceUrl: "https://unsplash.com/photos/a-man-in-a-white-suit-standing-on-a-brick-walkway-5RQomq7cjNk",
  },
  landscape: {
    src: "/examples/volcanic-coast.jpg",
    alt: "Misty coastal cliffs with a small lighthouse in the distance",
    width: 1400,
    height: 970,
    credit: "Miguel A Amutio",
    sourceUrl: "https://unsplash.com/photos/misty-coastal-cliffs-with-a-distant-lighthouse-WCu6omRLGKc",
  },
  architecture: {
    src: "/examples/desert-pavilion.jpg",
    alt: "Modern shaded walkway built with natural earth walls and a wooden pergola",
    width: 1400,
    height: 2100,
    credit: "Adish (AJ)",
    sourceUrl: "https://unsplash.com/photos/modern-building-with-natural-rammed-earth-walls-and-wooden-pergola-DnOfern3gu8",
  },
};
