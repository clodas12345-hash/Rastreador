
export interface GoogleContact {
  name: string;
  phoneNumber: string;
}

export async function fetchGoogleContacts(accessToken: string): Promise<GoogleContact[]> {
  try {
    const res = await fetch('https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers&pageSize=1000', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (!res.ok) {
      throw new Error(`Google API error: ${res.statusText}`);
    }
    
    const data = await res.json();
    const connections = data.connections || [];
    
    return connections.map((person: any) => {
      const name = person.names?.[0]?.displayName || 'Sem Nome';
      const phoneNumber = person.phoneNumbers?.[0]?.value || '';
      return { name, phoneNumber };
    }).filter((c: GoogleContact) => c.phoneNumber);
  } catch (error) {
    console.error('Error fetching Google contacts:', error);
    throw error;
  }
}
