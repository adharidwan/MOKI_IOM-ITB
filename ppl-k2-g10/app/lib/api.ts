// src/lib/api.ts

// Mock data to simulate a database
const mockTickets = [
  { 
    id: '1', 
    subject: 'Login Issue', 
    description: 'I cannot log into my account using the mobile app. It keeps saying invalid credentials.',
    status: 'Open', 
    userEmail: 'user@example.com',
    createdAt: '2026-03-12',
    replies: [
      { id: 'r1', author: 'Support Bot', content: 'Please try resetting your password.' }
    ]
  },
  { 
    id: '2', 
    subject: 'Payment Failed', 
    description: 'My transaction was declined but the money was taken from my bank.',
    status: 'Closed', 
    userEmail: 'customer@test.com',
    createdAt: '2026-03-11',
    replies: []
  },
];

export async function getTickets({ page = 1, search = '', sort = 'id' }) {
  const filtered = mockTickets.filter(t => 
    t.subject.toLowerCase().includes(search.toLowerCase())
  );
  return {
    tickets: filtered,
    total: filtered.length,
  };
}

// THE MISSING FUNCTION:
export async function getTicketById(id: string) {
  const ticket = mockTickets.find((t) => t.id === id);
  
  if (!ticket) {
    throw new Error('Ticket not found');
  }
  
  return ticket;
}