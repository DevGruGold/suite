import { ContributorDashboard } from '@/components/ContributorDashboard';
import { SEOHead } from '@/components/SEOHead';

const Contributors = () => {
  return (
    <>
      <SEOHead
        title="Earn XMRT Tokens 3 Ways | Suite Contributors"
        description="Code, mine, or charge your phone - earn XMRT tokens. Multiple value-creation pathways for developers, miners, and device owners."
        image="/og-image-contributors.svg"
        url="/contributors"
        keywords="XMRT tokens, crypto rewards, GitHub contributions, mining, proof of participation"
        twitterLabel1="💰 Earn"
        twitterData1="3 Ways"
        twitterLabel2="⚡ Rewards"
        twitterData2="Real-time"
      />
      <div className="py-6">
        <ContributorDashboard />
      </div>
    </>
  );
};

export default Contributors;
