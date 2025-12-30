import { Github, Twitter, Mail } from "lucide-react";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";

export function Footer() {
  const openEmail = () => {
    const subject = "XMRT-DAO Inquiry";
    const body = "Hello,\n\nI'm interested in learning more about XMRT-DAO and Suite.\n\nBest regards,";
    const encodedSubject = encodeURIComponent(subject);
    const encodedBody = encodeURIComponent(body);
    window.location.href = `mailto:xmrtsolutions@gmail.com?subject=${encodedSubject}&body=${encodedBody}`;
  };

  return (
    <footer className="w-full bg-card/50 backdrop-blur-sm border-t border-border py-4 sm:py-6 mt-8 sm:mt-12">
      <div className="container mx-auto px-3 sm:px-4 lg:px-6">
        <div className="flex flex-col gap-4 sm:gap-3">
          {/* Top row: Copyright and Social Links */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 sm:gap-4">
            <div className="text-muted-foreground text-xs sm:text-sm text-center sm:text-left">
              © 2026 XMRT-DAO. All rights reserved.
            </div>
            <div className="flex gap-3 sm:gap-4 items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={openEmail}
                className="text-muted-foreground hover:text-primary transition-colors h-8 w-8 sm:h-10 sm:w-10"
                aria-label="Contact via email"
              >
                <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
              <a
                href="https://twitter.com/XMRTDAO"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors p-2"
                aria-label="Follow us on Twitter"
              >
                <Twitter className="w-4 h-4 sm:w-5 sm:h-5" />
              </a>
              <a
                href="https://github.com/DevGruGold/xmrtassistant"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors p-2"
                aria-label="View on GitHub"
              >
                <Github className="w-4 h-4 sm:w-5 sm:h-5" />
              </a>
            </div>
          </div>
          
          {/* Bottom row: Legal Links */}
          <div className="flex justify-center items-center gap-4 sm:gap-6 text-xs sm:text-sm">
            <Link 
              to="/privacy" 
              className="text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
            >
              Privacy Policy
            </Link>
            <span className="text-muted-foreground">•</span>
            <Link 
              to="/terms" 
              className="text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
