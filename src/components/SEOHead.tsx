import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  keywords?: string;
}

const BASE_URL = 'https://suite-beta.vercel.app';

export const SEOHead = ({ 
  title = "Replace Your C-Suite, Not Your Workers | Suite",
  description = "AI executives save companies $12.4M in executive costs - redistributed as 41% raises to every employee. Ethical AI that empowers workers, not replaces them.",
  image = "/og-image.svg",
  url = "/licensing",
  type = "website",
  keywords = "AI executives, executive replacement, ethical AI, employee raises, salary redistribution, C-suite automation"
}: SEOHeadProps) => {
  const fullUrl = `${BASE_URL}${url}`;
  const fullImage = `${BASE_URL}${image}`;

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <link rel="canonical" href={fullUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="Suite" />
      <meta property="og:locale" content="en_US" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={fullUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImage} />
      <meta name="twitter:site" content="@XMRT_DAO" />
      <meta name="twitter:creator" content="@XMRT_DAO" />
      <meta name="twitter:label1" content="💰 Average Savings" />
      <meta name="twitter:data1" content="$12.4M/year" />
      <meta name="twitter:label2" content="📈 Employee Raises" />
      <meta name="twitter:data2" content="41% per worker" />

      {/* LinkedIn */}
      <meta property="og:article:author" content="Suite by XMRT-DAO" />
      <meta property="og:article:published_time" content="2024-12-01" />
    </Helmet>
  );
};

export default SEOHead;
