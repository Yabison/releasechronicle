-- CreateTable
CREATE TABLE "UserPreference" (
    "username" TEXT NOT NULL,
    "locale" TEXT,
    "theme" TEXT,
    "homePath" TEXT,
    "homeQuery" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("username")
);
