import {
	Alert,
	Box,
	Button,
	Paper,
	TextField,
	Typography,
} from '@mui/material';

import { getCsvContacts } from '../lib/api';
import {
	createPhoneListContactAction,
} from './actions';
import PhoneListToast from '../components/PhoneListToast';
import PhoneListTable from '../components/PhoneListSearch';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PhoneListPage() {
	const contacts = await getCsvContacts();

	return (
		<main style={{ padding: '2rem' }}>
			<PhoneListToast />
			<Paper sx={{ p: 4, maxWidth: 1200, mx: 'auto', backgroundColor: '#EDF7BD', borderRadius: 2 }}>
				<Typography variant="h5" gutterBottom sx={{ color: '#4e8d9c', fontWeight: 'bold' }}>
					Phone List
				</Typography>

				<Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
					Kelola data nomor telepon hasil import CSV.
				</Typography>

				<Box
					component="form"
					action={createPhoneListContactAction}
					sx={{
						display: 'grid',
						gridTemplateColumns: { xs: '1fr', md: '1.3fr 1.2fr 1fr 1fr auto' },
						gap: 2,
						mb: 3,
						alignItems: 'center',
					}}
				>
					<TextField name="no_telp" label="No Telp" required size="small" />
					<TextField name="nama" label="Nama" required size="small" />
					<TextField name="jenis_kelamin" label="Jenis kelamin" required size="small" />
					<TextField name="jabatan" label="Jabatan (opsional)" size="small" />
					<Button type="submit" variant="contained" sx={{ backgroundColor: '#4e8d9c', height: 40 }}>
						Tambah
					</Button>
				</Box>

				{contacts.length === 0 ? (
					<Alert severity="info">Belum ada data phone list.</Alert>
				) : (
					<PhoneListTable contacts={contacts} />
				)}
			</Paper>
		</main>
	);
}
