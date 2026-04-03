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
	sendGroupBlastAction,
} from './actions';
import PhoneListToast from '../components/PhoneListToast';
import PhoneListTable from '../components/PhoneListSearch';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PhoneListPage() {
	const contacts = await getCsvContacts();
	const availableGroups = Array.from(
		new Set(contacts.flatMap((contact) => contact.group_names)),
	).sort((left, right) => left.localeCompare(right));

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
						gridTemplateColumns: { xs: '1fr', md: '1.3fr 1.2fr 1fr 1fr 1fr auto' },
						gap: 2,
						mb: 3,
						alignItems: 'center',
					}}
				>
					<TextField name="no_telp" label="No Telp" required size="small" />
					<TextField name="nama" label="Nama" required size="small" />
					<TextField name="jenis_kelamin" label="Jenis kelamin" required size="small" />
					<TextField name="jabatan" label="Jabatan (opsional)" size="small" />
					<TextField
						name="group_names"
						label="Group / label (opsional, pisahkan koma)"
						size="small"
					/>
					<Button type="submit" variant="contained" sx={{ backgroundColor: '#4e8d9c', height: 40 }}>
						Tambah
					</Button>
				</Box>

				<Paper sx={{ p: 3, mb: 3, borderRadius: 2, border: '1px solid rgba(78, 141, 156, 0.25)' }}>
					<Typography variant="h6" sx={{ mb: 1, color: '#4e8d9c', fontWeight: 'bold' }}>
						Blast ke Segment
					</Typography>
					<Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
						Pilih satu atau lebih segment, lalu kirim pesan blast ke semua kontak di segment tersebut.
					</Typography>

					{availableGroups.length === 0 ? (
						<Alert severity="info">Belum ada segment. Tambahkan group pada kontak terlebih dahulu.</Alert>
					) : (
						<Box component="form" action={sendGroupBlastAction} sx={{ display: 'grid', gap: 2 }}>
							<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
								{availableGroups.map((groupName) => (
									<Box
										key={groupName}
										component="label"
										sx={{
											display: 'inline-flex',
											alignItems: 'center',
											gap: 1,
											px: 1.5,
											py: 0.75,
											borderRadius: 999,
											border: '1px solid rgba(78, 141, 156, 0.35)',
											backgroundColor: '#fff',
										}}>
										<input type="checkbox" name="group_names" value={groupName} />
										<Typography variant="body2">{groupName}</Typography>
									</Box>
								))}
							</Box>

							<TextField
								name="message"
								label="Pesan blast"
								multiline
								minRows={4}
								required
								placeholder="Tulis pesan yang akan dikirim ke semua kontak dalam segment terpilih"
							/>

							<Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
								<Button type="submit" variant="contained" sx={{ backgroundColor: '#4e8d9c' }}>
									Kirim Blast Segment
								</Button>
							</Box>
						</Box>
					)}
				</Paper>

				{contacts.length === 0 ? (
					<Alert severity="info">Belum ada data phone list.</Alert>
				) : (
					<PhoneListTable contacts={contacts} />
				)}
			</Paper>
		</main>
	);
}
