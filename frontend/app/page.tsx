// import Image from "next/image";

// export default function Home() {
//   return (
//     <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)]">
//       <h1 className="text-4xl font-bold mb-4">Welcome to Our App</h1>
//       <p className="text-lg text-gray-600">Please sign in to continue</p>
//     </div>
//   );
// }

'use client'
import { useEffect, useState } from 'react'
import { useSession, useUser } from '@clerk/nextjs'

export default function Home() {
  const [loading, setLoading] = useState(true)
  const { user, isLoaded: isUserLoaded } = useUser()
  const { session, isLoaded: isSessionLoaded } = useSession()

  useEffect(() => {
    if (!isUserLoaded || !isSessionLoaded) return
    setLoading(false)
  }, [isUserLoaded, isSessionLoaded])

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-4">Welcome</h1>
      
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : user ? (
        <div>
          <p>Hello, {user.firstName || 'User'}!</p>
          <p className="mt-4">You are logged in.</p>
        </div>
      ) : (
        <p>Please sign in to continue.</p>
      )}
    </div>
  )
}